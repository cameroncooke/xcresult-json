import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');
const REAL_XCRESULT_PATH = path.join(__dirname, 'fixtures', 'TestResult.xcresult');

function runCLI(args: string): any {
  let result: string;
  try {
    result = execSync(
      `node "${CLI_PATH}" ${args}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
  } catch (error: any) {
    // CLI may exit with 10 due to test failures, but still outputs JSON
    result = error.stdout;
  }
  return JSON.parse(result);
}

describe('Integration Tests with Real xcresult', () => {
  beforeAll(() => {
    // Ensure the CLI is built
    if (!fs.existsSync(CLI_PATH)) {
      execSync('npm run build', { cwd: path.join(__dirname, '..') });
    }
  });

  it('should parse real xcresult bundle successfully', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    expect(result).toBeDefined();
    expect(result.suites).toBeDefined();
    expect(Array.isArray(result.suites)).toBe(true);
    expect(typeof result.totalTests).toBe('number');
    expect(typeof result.totalSuites).toBe('number');
    expect(typeof result.totalDuration).toBe('number');
  });

  it('should contain expected test suites from calculator app', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    // Look for our calculator test suites
    const allTests = result.suites.flatMap((suite: any) => [...suite.passed, ...suite.failed]);
    const testNames = allTests.map((test: any) => test.name);
    
    // Should contain tests from CalculatorServiceTests.swift
    expect(testNames.some((name: string) => name.includes('Calculator') || name.includes('test'))).toBe(true);
  });

  it('should have correct test structure', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    // Verify each suite has the correct structure
    result.suites.forEach((suite: any) => {
      expect(suite.suiteName).toBeDefined();
      expect(typeof suite.duration).toBe('number');
      expect(Array.isArray(suite.passed)).toBe(true);
      expect(Array.isArray(suite.failed)).toBe(true);
      
      // Verify test structure
      [...suite.passed, ...suite.failed].forEach((test: any) => {
        expect(test.name).toBeDefined();
        expect(test.status).toBeDefined();
        expect(['Success', 'Failure'].includes(test.status)).toBe(true);
        expect(typeof test.duration).toBe('number');
        // File and line properties removed from output format
      });
    });
  });

  it('should handle test hierarchy correctly', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    // Should have at least one test suite
    expect(result.suites.length).toBeGreaterThan(0);
    
    // Should have some tests
    const totalTestCount = result.suites.reduce(
      (sum: number, suite: any) => sum + suite.passed.length + suite.failed.length, 
      0
    );
    expect(totalTestCount).toBeGreaterThan(0);
  });

  it('should calculate summary statistics correctly', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    expect(typeof result.totalTests).toBe('number');
    expect(typeof result.totalSuites).toBe('number');
    expect(typeof result.totalDuration).toBe('number');
    
    // Total tests should match sum of all tests in suites
    const actualTotal = result.suites.reduce(
      (sum: number, suite: any) => sum + suite.passed.length + suite.failed.length,
      0
    );
    expect(result.totalTests).toBe(actualTotal);
    
    // Total suites should match suites array length
    expect(result.totalSuites).toBe(result.suites.length);
  });

  it('should handle pretty printing', () => {
    let result: string;
    try {
      result = execSync(
        `node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}" --pretty`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );
    } catch (error: any) {
      // CLI may exit with 10 due to test failures, but still outputs JSON
      result = error.stdout;
    }
    
    // Pretty JSON should have indentation
    expect(result).toContain('  ');
    expect(result).toContain('\n');
    
    // Should still be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.totalSuites).toBeDefined();
  });

  it('should handle test timing data', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    // All tests should have valid timing
    result.suites.forEach((suite: any) => {
      expect(suite.duration).toBeGreaterThanOrEqual(0);
      [...suite.passed, ...suite.failed].forEach((test: any) => {
        expect(test.duration).toBeGreaterThanOrEqual(0);
      });
    });
    
    // Should have overall test run duration
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('should parse expected number of tests from mixed calculator app', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    // We now expect around 55 tests total (Swift Testing + XCTest with Xcode 16 parsing)
    expect(result.totalTests).toBe(55);
    
    // We expect multiple test suites (Swift Testing parsed as individual suites in Xcode 16)
    expect(result.totalSuites).toBeGreaterThanOrEqual(5);
    
    // Should have some test failures (we added intentional failures)
    const failedTests = result.suites.reduce(
      (sum: number, suite: any) => sum + suite.failed.length,
      0
    );
    expect(failedTests).toBeGreaterThan(0);
  });

  it('should parse both Swift Testing and XCTest frameworks', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    const suiteNames = result.suites.map((suite: any) => suite.suiteName);
    
    // Should contain XCTest suite (from CalculatorAppTests)
    expect(suiteNames).toContain('CalculatorAppTests');
    
    // Should contain some Swift Testing suites (they get parsed as separate suites in Xcode 16)
    expect(suiteNames).toContain('Calculator Basic Functionality');
    expect(suiteNames).toContain('Mathematical Operations');
    
    // Verify we have multiple test suites total (Xcode 16 parses Swift Testing as separate suites)
    expect(result.totalSuites).toBeGreaterThanOrEqual(5);
    
    // Should have mixed test frameworks
    expect(suiteNames.length).toBeGreaterThanOrEqual(5);
  });

  it('should handle different test naming patterns', () => {
    const result = runCLI(`--path "${REAL_XCRESULT_PATH}"`);
    
    // Find the XCTest suite
    const xctestSuite = result.suites.find((suite: any) => 
      suite.suiteName === 'CalculatorAppTests'
    );
    expect(xctestSuite).toBeDefined();
    
    // XCTest tests should have different naming patterns
    const xctestTestNames = [...xctestSuite.passed, ...xctestSuite.failed].map((test: any) => test.name);
    
    // Should include some of our XCTest method names
    const hasXCTestPattern = xctestTestNames.some((name: string) => 
      name.includes('test') || name.includes('Test')
    );
    expect(hasXCTestPattern).toBe(true);
    
    // Find a Swift Testing suite (they're parsed as individual suites in Xcode 16)
    const swiftTestingSuite = result.suites.find((suite: any) => 
      suite.suiteName === 'Calculator Basic Functionality'
    );
    expect(swiftTestingSuite).toBeDefined();
    
    // Swift Testing tests have descriptive names
    const swiftTestingTestNames = [...swiftTestingSuite.passed, ...swiftTestingSuite.failed].map((test: any) => test.name);
    const hasSwiftTestingPattern = swiftTestingTestNames.some((name: string) => 
      name.includes('Calculator') || name.includes('should')
    );
    expect(hasSwiftTestingPattern).toBe(true);
  });
});