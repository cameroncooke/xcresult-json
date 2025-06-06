/**
 * Core parsing logic - pure business logic with injected dependencies
 */

import { XCResultDataSource, FormatParser } from './interfaces.js';
import { XCResultError } from './errors.js';
import { Report } from '../types/report.js';

/**
 * Main parser that orchestrates format detection and parsing
 * Uses dependency injection for testability
 */
export class XCResultParser {
  private parsers: FormatParser[] = [];

  constructor(private dataSource: XCResultDataSource) {}

  /**
   * Register a format parser
   */
  registerParser(parser: FormatParser): void {
    this.parsers.push(parser);
    // Sort by priority (highest first)
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Parse xcresult bundle into structured format
   */
  async parse(bundlePath: string): Promise<Report> {
    // Validate input
    if (!bundlePath) {
      throw XCResultError.invalidBundle('Path is required');
    }

    try {
      // Get raw data via injected data source
      const data = await this.dataSource.getData(bundlePath);

      // Try each parser in priority order
      for (const parser of this.parsers) {
        if (parser.canParse(data)) {
          try {
            return await parser.parse(bundlePath, data);
          } catch (error) {
            // Log parser failure and try next one
            console.warn(`Parser ${parser.name} failed:`, error);
            continue;
          }
        }
      }

      // No parser could handle the data
      throw XCResultError.unsupportedFormat();
    } catch (error) {
      if (error instanceof XCResultError) {
        throw error;
      }

      // Wrap other errors
      throw XCResultError.xcresulttoolFailed(error as Error);
    }
  }

  /**
   * Get list of registered parsers (for testing)
   */
  getParsers(): readonly FormatParser[] {
    return [...this.parsers];
  }
}
