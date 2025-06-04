export interface TestResult {
  name: string; // e.g. "LoginTests.testValidLogin"
  status: 'Success' | 'Failure';
  duration: number; // seconds
  file: string; // absolute path
  line: number; // 1-based line number
  failureMessage?: string;
}

export interface SuiteResult {
  suiteName: string; // XCTest target or Swift-Testing suite
  duration: number; // sum of its tests
  failed: TestResult[];
  passed: TestResult[];
}

export interface Report {
  totalSuites: number;
  totalTests: number;
  totalDuration: number;
  suites: SuiteResult[];
}
