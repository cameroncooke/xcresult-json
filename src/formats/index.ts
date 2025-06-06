/**
 * Format parsers factory
 * Creates and configures all available format parsers
 */

import { FormatParser } from '../core/interfaces.js';
import { Xcode16FormatParser } from './xcode16-format-parser.js';
import { Xcode15FormatParser } from './xcode15-format-parser.js';
import { LegacyFormatParser } from './legacy-format-parser.js';

/**
 * Create all available format parsers
 * Returns them in priority order (highest first)
 */
export function createFormatParsers(): FormatParser[] {
  return [
    new Xcode16FormatParser(), // Priority 100 - Latest format
    new Xcode15FormatParser(), // Priority 90  - Xcode 15.x format
    new LegacyFormatParser(), // Priority 80  - Legacy format for fixtures
  ];
}
