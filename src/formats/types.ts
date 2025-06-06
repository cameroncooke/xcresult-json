/**
 * Common result structure that all format parsers must produce
 * This is the abstraction layer that remains constant regardless of xcresult format
 */
export interface ParsedTestResult {
  name: string;
  status: 'Success' | 'Failure' | 'Skipped';
  duration: number; // in seconds
  failureMessage?: string;
}

export interface ParsedSuiteResult {
  suiteName: string;
  duration: number; // in seconds
  failed: ParsedTestResult[];
  passed: ParsedTestResult[];
}

export interface ParsedReport {
  totalSuites: number;
  totalTests: number;
  totalDuration: number; // in seconds
  suites: ParsedSuiteResult[];
}

/**
 * Interface that all format parsers must implement
 */
export interface FormatParser {
  /**
   * Name of the format (e.g., "xcode16.4", "xcode15.x", "legacy")
   */
  name: string;
  
  /**
   * Priority order for trying parsers (higher = try first)
   */
  priority: number;
  
  /**
   * Check if this parser can handle the given xcresult data
   */
  canParse(data: any): boolean;
  
  /**
   * Parse the xcresult data into our common format
   */
  parse(bundlePath: string, data: any): Promise<ParsedReport>;
}

/**
 * Xcresulttool capabilities based on version
 */
export interface XcresulttoolCapabilities {
  version: number;
  supportsGetObject: boolean;
  supportsGetTestResults: boolean;
  supportsLegacyFlag: boolean;
  commandFormat: 'modern' | 'legacy' | 'basic';
}