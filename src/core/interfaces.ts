/**
 * Core interfaces for xcresult parsing
 * These define the contracts between layers
 */

import { Report } from '../types/report.js';

/**
 * Interface for getting raw xcresult data
 * Implementation details (xcresulttool, file reading, etc.) are hidden
 */
export interface XCResultDataSource {
  /**
   * Get raw xcresult data from a bundle path
   * @param bundlePath - Path to xcresult bundle
   * @returns Promise resolving to raw xcresult data
   */
  getData(bundlePath: string): Promise<any>;
}

/**
 * Options for configuring data source behavior
 */
export interface DataSourceOptions {
  /** Enable caching of responses */
  cache?: boolean;
  /** Enable validation of responses */
  validate?: boolean;
}

/**
 * Interface for parsing xcresult data into structured format
 */
export interface FormatParser {
  /** Parser name for identification */
  readonly name: string;
  /** Priority for format detection (higher = tried first) */
  readonly priority: number;
  
  /**
   * Check if this parser can handle the given data
   * @param data - Raw xcresult data
   * @returns true if parser can handle this format
   */
  canParse(data: any): boolean;
  
  /**
   * Parse the data into structured format
   * @param bundlePath - Original bundle path (for context)
   * @param data - Raw xcresult data
   * @returns Promise resolving to parsed report
   */
  parse(bundlePath: string, data: any): Promise<Report>;
}