import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');
const JSON_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'simple-test.json');

describe('CLI with JSON Fixtures', () => {
  beforeAll(() => {
    // Ensure the CLI is built
    if (!fs.existsSync(CLI_PATH)) {
      execSync('npm run build', { cwd: path.join(__dirname, '..') });
    }
  });

  it('should parse JSON fixture and output JSON', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    // Should be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.totalSuites).toBe(1);
    expect(parsed.totalTests).toBe(2);
    expect(parsed.totalDuration).toBeCloseTo(0.579, 3);
    expect(Array.isArray(parsed.suites)).toBe(true);
  });

  it('should output pretty JSON when --pretty flag is used', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}" --pretty`,
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
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}"`,
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
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}"`,
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
    
    // Should have some failing tests
    const hasFailures = parsed.suites.some((suite: any) => suite.failed.length > 0);
    expect(hasFailures).toBe(true);
  });

  it('should validate output against schema when available', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}" --validate`,
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
          passed: expect.any(Array),
        }),
      ]),
    });
  });

  it('should show specific failure messages for failed tests', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      result = error.stdout;
    }
    
    const parsed = JSON.parse(result);
    
    // Find the failed test
    const failedTests = parsed.suites.flatMap((suite: any) => suite.failed);
    expect(failedTests.length).toBeGreaterThan(0);
    
    const firstFailure = failedTests[0];
    expect(firstFailure.failureMessage).toBeDefined();
    expect(firstFailure.failureMessage).toBe('Test failed');
  });

  it('should accept --no-cache flag without errors', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${JSON_FIXTURE_PATH}" --no-cache`,
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
  });
});