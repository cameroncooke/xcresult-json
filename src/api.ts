/**
 * Public API for xcresult-json
 * This is the ONLY interface external users should depend on
 */

import { XCResultParser } from './core/parser.js';
import { XCResultToolDataSource } from './infrastructure/xcresulttool-data-source.js';
import { Report } from './types/report.js';
import { createFormatParsers } from './formats/index.js';

export interface ParseOptions {
  /** Enable JSON schema validation (warnings only) */
  validate?: boolean;
  /** Enable caching of xcresulttool responses */
  cache?: boolean;
}

/**
 * Parse an xcresult bundle and return structured test results
 * 
 * @param bundlePath - Path to .xcresult bundle
 * @param options - Optional parsing configuration
 * @returns Promise resolving to structured test results
 * @throws XCResultError for invalid bundles or xcresulttool issues
 */
export async function parseXCResult(bundlePath: string, options: ParseOptions = {}): Promise<Report> {
  // Create data source with options
  const dataSource = new XCResultToolDataSource({
    cache: options.cache ?? true,
    validate: options.validate ?? false
  });
  
  // Create parser with injected dependency
  const parser = new XCResultParser(dataSource);
  
  // Register format parsers
  const formatParsers = createFormatParsers();
  formatParsers.forEach(p => parser.registerParser(p));
  
  // Parse and return results
  return await parser.parse(bundlePath);
}

// Re-export public types
export { Report, SuiteResult, TestResult } from './types/report.js';
export { XCResultError } from './core/errors.js';