/**
 * Legacy xcjson interface for backwards compatibility
 * Simplified version that works with the new architecture
 */

import { LRUCache } from './cache.js';

// Cache management
const cache = new LRUCache<string, any>(100);
let cacheEnabled = true;

export class XcjsonError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'XcjsonError';
    this.code = code;
  }
}

export function clearCache(): void {
  cache.clear();
}

export function disableCache(): void {
  cacheEnabled = false;
  clearCache();
}

export function enableCache(): void {
  cacheEnabled = true;
}

// Check if cache is enabled (for tests)
export function isCacheEnabled(): boolean {
  return cacheEnabled;
}

export async function getSchema(_subcommand: string): Promise<any> {
  // Return a basic schema structure for CLI --schema option
  return {
    type: 'object',
    properties: {
      totalSuites: { type: 'number' },
      totalTests: { type: 'number' },
      totalDuration: { type: 'number' },
      suites: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            suiteName: { type: 'string' },
            duration: { type: 'number' },
            failed: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string' },
                  duration: { type: 'number' },
                  failureMessage: { type: 'string' }
                }
              }
            },
            passed: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string' },
                  duration: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  };
}

// Legacy functions - deprecated, use the new API instead
export async function getSummary(_bundlePath: string): Promise<any> {
  throw new Error('getSummary is deprecated. Use parseXCResult from api.js instead.');
}

export async function getTestDetails(_bundlePath: string, _referenceId: string): Promise<any> {
  throw new Error('getTestDetails is deprecated. Use parseXCResult from api.js instead.');
}