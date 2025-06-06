import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');
const REAL_XCRESULT_PATH = path.join(__dirname, 'fixtures', 'TestResult.xcresult');

describe('CLI E2E Tests', () => {
  beforeAll(() => {
    // Ensure the CLI is built
    if (!fs.existsSync(CLI_PATH)) {
      execSync('npm run build', { cwd: path.join(__dirname, '..') });
    }
  });

  it('should show help when no arguments provided', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, { encoding: 'utf8' });
    
    expect(result).toContain('Usage:');
    expect(result).toContain('--path');
    expect(result).toContain('--pretty');
  });

  it('should parse real xcresult and output JSON', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    // Should be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.totalSuites).toBeDefined();
    expect(parsed.totalTests).toBeDefined();
    expect(parsed.totalDuration).toBeDefined();
    expect(parsed.suites).toBeDefined();
  });

  it('should output pretty JSON when --pretty flag is used', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}" --pretty`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    // Pretty JSON should have indentation
    expect(result).toContain('  ');
    expect(result).toContain('\n');
    
    // Should still be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.totalSuites).toBeDefined();
  });

  it('should exit with code 10 when tests fail', () => {
    let exitCode: number | null = null;
    
    try {
      execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}"`,
        { encoding: 'utf8' }
      );
      exitCode = 0;
    } catch (error: any) {
      exitCode = error.status;
    }
    
    // Our test fixture has intentional failures, so should exit with 10
    expect(exitCode).toBe(10);
  });

  it('should output JSON even when tests fail', () => {
    // This test verifies that CLI outputs valid JSON even when exiting with code 10
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    const parsed = JSON.parse(result);
    
    // Should have valid structure
    expect(typeof parsed.totalTests).toBe('number');
    expect(Array.isArray(parsed.suites)).toBe(true);
    expect(parsed.totalTests).toBeGreaterThan(0);
  });

  it('should handle invalid xcresult path gracefully', () => {
    let error: any = null;
    
    try {
      execSync(
        `node "${CLI_PATH}" --path "/nonexistent/path.xcresult"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (err) {
      error = err;
    }
    
    expect(error).toBeTruthy();
    expect(error.status).toBeGreaterThan(0);
  });

  it('should validate output against schema when available', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    const parsed = JSON.parse(result);
    
    // Validate basic structure matches our expected schema
    expect(parsed).toMatchObject({
      totalSuites: expect.any(Number),
      totalTests: expect.any(Number),
      totalDuration: expect.any(Number),
      suites: expect.arrayContaining([
        expect.objectContaining({
          suiteName: expect.any(String),
          duration: expect.any(Number),
          failed: expect.any(Array),
          passed: expect.any(Array)
        })
      ])
    });
  });

  it('should handle missing required arguments', () => {
    let error: any = null;
    
    try {
      execSync(`node "${CLI_PATH}"`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      error = err;
    }
    
    expect(error).toBeTruthy();
    expect(error.status).toBeGreaterThan(0);
  });

  it('should accept --no-cache flag without errors', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}" --no-cache`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    // Should be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.totalSuites).toBeDefined();
    expect(parsed.totalTests).toBeDefined();
    expect(parsed.totalDuration).toBeDefined();
    expect(parsed.suites).toBeDefined();
  });

  it('should show --no-cache in help output', () => {
    const result = execSync(`node "${CLI_PATH}" --help`, { encoding: 'utf8' });
    
    expect(result).toContain('--no-cache');
    expect(result).toContain('Disable caching of xcresulttool responses');
  });
});