import { FormatParser, ParsedReport } from './types.js';

/**
 * Registry for xcresult format parsers
 * Manages multiple parsers and tries them in priority order
 */
export class ParserRegistry {
  private parsers: FormatParser[] = [];

  /**
   * Register a new format parser
   */
  register(parser: FormatParser): void {
    this.parsers.push(parser);
    // Keep parsers sorted by priority (highest first)
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get all registered parsers in priority order
   */
  getParsers(): FormatParser[] {
    return [...this.parsers];
  }

  /**
   * Try to parse xcresult data using registered parsers
   * Tries parsers in priority order until one succeeds
   */
  async parse(bundlePath: string, data: any): Promise<ParsedReport> {
    const errors: Error[] = [];

    for (const parser of this.parsers) {
      try {
        if (parser.canParse(data)) {
          return await parser.parse(bundlePath, data);
        }
      } catch (error) {
        errors.push(
          new Error(
            `${parser.name} parser failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }

    // If no parser could handle the data, throw a comprehensive error
    const errorMessages = errors.map((e) => e.message).join('\n  ');
    throw new Error(
      `No parser could handle the xcresult format. Tried parsers in order:\n  ${errorMessages}\n` +
        `Available parsers: ${this.parsers.map((p) => p.name).join(', ')}`
    );
  }

  /**
   * Clear all registered parsers (mainly for testing)
   */
  clear(): void {
    this.parsers = [];
  }
}

// Global registry instance
export const parserRegistry = new ParserRegistry();
