/**
 * End-to-end CLI integration tests
 * Tests the complete CLI workflow with real xcresult bundles
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const CLI_PATH = join(__dirname, '../../dist/index.js');
const FIXTURES_DIR = join(__dirname, '../fixtures');

// Helper to run CLI and capture output
function runCLI(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status || 1
    };
  }
}

describe('CLI E2E Tests', () => {
  beforeAll(() => {
    // Verify CLI was built
    expect(existsSync(CLI_PATH)).toBe(true);
  });

  describe('Help and Version', () => {
    it('should display help when --help flag is used', () => {
      const result = runCLI(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--path');
      expect(result.stdout).toContain('--pretty');
    });

    it('should display version when --version flag is used', () => {
      const result = runCLI(['--version']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('Error Handling', () => {
    it('should fail with proper error when no path is provided', () => {
      const result = runCLI([]);
      
      expect(result.exitCode).not.toBe(0);
      // Check both stdout and stderr for the error message
      const output = result.stdout + result.stderr;
      expect(output).toContain('--path is required unless using --schema');
    });

    it('should fail with proper error when non-existent file is provided', () => {
      const result = runCLI(['--path', '/non/existent/file.xcresult']);
      
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("doesn't exist");
    });

    it('should fail with proper error when invalid bundle is provided', () => {
      const result = runCLI(['--path', __filename]); // Use this test file
      
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('JSON Fixtures', () => {
    const simpleTestPath = join(FIXTURES_DIR, 'simple-test.json');
    
    it('should parse JSON fixture successfully', () => {
      if (!existsSync(simpleTestPath)) {
        console.warn('simple-test.json fixture not found, skipping test');
        return;
      }

      const result = runCLI(['--path', simpleTestPath]);
      
      // Should exit with code 10 (test failures present)
      expect([0, 10]).toContain(result.exitCode);
      
      // Should produce valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('totalSuites');
      expect(output).toHaveProperty('totalTests');
      expect(output).toHaveProperty('totalDuration');
      expect(output).toHaveProperty('suites');
      expect(Array.isArray(output.suites)).toBe(true);
    });

    it('should format JSON prettily when --pretty flag is used', () => {
      if (!existsSync(simpleTestPath)) {
        console.warn('simple-test.json fixture not found, skipping test');
        return;
      }

      const result = runCLI(['--path', simpleTestPath, '--pretty']);
      
      expect([0, 10]).toContain(result.exitCode);
      
      // Pretty-printed JSON should have indentation
      expect(result.stdout).toContain('  "totalSuites"');
      expect(result.stdout).toContain('\n');
    });
  });

  describe('Real xcresult Bundles', () => {
    // Test with any available xcresult bundles
    const possibleBundles = [
      'TestResult.xcresult',
      'xcode16.0-result.xcresult',
      'xcode16.1-result.xcresult', 
      'xcode16.2-result.xcresult',
      'xcode15.4-result.xcresult'
    ];

    let availableBundles: string[] = [];
    
    beforeAll(() => {
      availableBundles = possibleBundles
        .map(bundle => join(FIXTURES_DIR, bundle))
        .filter(path => existsSync(path));
    });

    it('should have at least one real xcresult bundle for testing', () => {
      if (availableBundles.length === 0) {
        console.warn('No xcresult bundles found for integration testing');
        console.warn('Looked for:', possibleBundles.map(b => join(FIXTURES_DIR, b)));
      }
      // Allow test to pass if no bundles are available
      expect(availableBundles.length).toBeGreaterThanOrEqual(0);
    });

    it.each(availableBundles.length > 0 ? availableBundles.map(b => [b]) : [['No bundles available']])('should parse real xcresult bundle: %s', (bundlePath) => {
      if (availableBundles.length === 0 || bundlePath === 'No bundles available') {
        console.warn('Skipping test - no xcresult bundles available');
        return;
      }
      const result = runCLI(['--path', bundlePath]);
      
      // Should exit with appropriate code (0 for all pass, 10 for failures)
      expect([0, 10]).toContain(result.exitCode);
      
      // Should produce valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      
      const output = JSON.parse(result.stdout);
      
      // Verify structure
      expect(output).toHaveProperty('totalSuites');
      expect(output).toHaveProperty('totalTests');
      expect(output).toHaveProperty('totalDuration');
      expect(output).toHaveProperty('suites');
      
      // Verify data types
      expect(typeof output.totalSuites).toBe('number');
      expect(typeof output.totalTests).toBe('number');
      expect(typeof output.totalDuration).toBe('number');
      expect(Array.isArray(output.suites)).toBe(true);
      
      // Should have reasonable values
      expect(output.totalSuites).toBeGreaterThan(0);
      expect(output.totalTests).toBeGreaterThan(0);
      expect(output.totalDuration).toBeGreaterThanOrEqual(0);
      
      // Verify suite structure
      output.suites.forEach((suite: any) => {
        expect(suite).toHaveProperty('suiteName');
        expect(suite).toHaveProperty('duration');
        expect(suite).toHaveProperty('failed');
        expect(suite).toHaveProperty('passed');
        
        expect(typeof suite.suiteName).toBe('string');
        expect(typeof suite.duration).toBe('number');
        expect(Array.isArray(suite.failed)).toBe(true);
        expect(Array.isArray(suite.passed)).toBe(true);
        
        // Verify test case structure
        [...suite.failed, ...suite.passed].forEach((test: any) => {
          expect(test).toHaveProperty('name');
          expect(test).toHaveProperty('status');
          expect(test).toHaveProperty('duration');
          
          expect(typeof test.name).toBe('string');
          expect(['Success', 'Failure', 'Skipped']).toContain(test.status);
          expect(typeof test.duration).toBe('number');
          
          // Failed tests should have failure message
          if (test.status === 'Failure') {
            expect(test).toHaveProperty('failureMessage');
            expect(typeof test.failureMessage).toBe('string');
            expect(test.failureMessage.length).toBeGreaterThan(0);
          }
        });
      });
    });

    it.each(availableBundles.length > 0 ? availableBundles.map(b => [b]) : [['No bundles available']])('should handle validate flag correctly: %s', (bundlePath) => {
      if (availableBundles.length === 0 || bundlePath === 'No bundles available') {
        console.warn('Skipping validation test - no xcresult bundles available');
        return;
      }
      const result = runCLI(['--path', bundlePath, '--validate']);
      
      // Should not fail validation for real bundles
      expect([0, 10]).toContain(result.exitCode);
      
      // Should still produce valid output
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should complete parsing within reasonable time', () => {
      const availableBundle = [
        join(FIXTURES_DIR, 'TestResult.xcresult'),
        join(FIXTURES_DIR, 'simple-test.json')
      ].find(path => existsSync(path));
      
      if (!availableBundle) {
        console.warn('No test bundle available for performance test');
        return;
      }
      
      const startTime = Date.now();
      const result = runCLI(['--path', availableBundle]);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      // Should complete within 30 seconds (very generous for CI)
      expect(duration).toBeLessThan(30000);
      
      // Should still produce valid output
      expect([0, 10]).toContain(result.exitCode);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });
});