import { LRUCache } from './cache.js';
import { detectCapabilities, getXcresultData } from './formats/detector.js';
import { parserRegistry } from './formats/registry.js';
import { Xcode16Parser } from './formats/xcode16-parser.js';
import { Xcode15Parser } from './formats/xcode15-parser.js';
import { Xcode15LegacyParser } from './formats/xcode15-legacy-parser.js';
import { LegacyParser } from './formats/legacy-parser.js';

// Register all format parsers on module load (in priority order)
parserRegistry.register(new Xcode16Parser()); // Priority 100 - Latest format
parserRegistry.register(new Xcode15Parser()); // Priority 90  - Xcode 15 modern
parserRegistry.register(new Xcode15LegacyParser()); // Priority 85  - Xcode 15 legacy fallback
parserRegistry.register(new LegacyParser()); // Priority 80  - Old test fixtures

export class XcjsonError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'XcjsonError';
    this.code = code;
  }
}

// In-memory cache for xcresulttool results
const cache = new LRUCache<string, any>(100);
let cacheEnabled = true;

export async function getSummary(bundlePath: string): Promise<any> {
  // Check cache first
  if (cacheEnabled) {
    const cached = cache.get(bundlePath);
    if (cached) {
      return cached;
    }
  }

  try {
    // Check if this is a JSON fixture file (for testing)
    if (bundlePath.endsWith('.json')) {
      const { readFileSync } = await import('fs');
      const data = JSON.parse(readFileSync(bundlePath, 'utf8'));
      if (cacheEnabled) {
        cache.set(bundlePath, data);
      }
      return data;
    }

    // Detect xcresulttool capabilities
    let capabilities;
    try {
      capabilities = await detectCapabilities();
    } catch (error) {
      // If we can't detect capabilities (e.g., in CI without Xcode), throw a clear error
      if (error instanceof Error && error.message.includes('Failed to detect xcresulttool')) {
        throw new XcjsonError('Failed to run xcresulttool. Ensure Xcode is installed.', 1);
      }
      throw error;
    }

    // Get xcresult data using appropriate command
    const result = await getXcresultData(bundlePath, capabilities);

    // Cache the result
    if (cacheEnabled) {
      cache.set(bundlePath, result);
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not a valid .xcresult bundle')) {
        throw new XcjsonError(`Invalid xcresult bundle: ${bundlePath}`, 2);
      }
      if (error.message.includes('not found') || error.message.includes('xcresulttool')) {
        throw new XcjsonError('Failed to run xcresulttool. Ensure Xcode is installed.', 1);
      }
    }
    throw new XcjsonError(
      `Failed to get test summary: ${error instanceof Error ? error.message : String(error)}`,
      2
    );
  }
}

export async function getTestDetails(bundlePath: string, referenceId: string): Promise<any> {
  // Create a cache key that includes both path and reference
  const cacheKey = `${bundlePath}:${referenceId}`;

  // Check cache first
  if (cacheEnabled) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // For test details, always use the legacy format with reference ID
    // This is only used by Xcode 15.x parser for getting failure messages
    const { execa } = await import('execa');
    const { stdout } = await execa('xcrun', [
      'xcresulttool',
      'get',
      '--legacy',
      '--path',
      bundlePath,
      '--id',
      referenceId,
      '--format',
      'json',
    ]);
    const result = JSON.parse(stdout);

    // Cache the result
    if (cacheEnabled) {
      cache.set(cacheKey, result);
    }
    return result;
  } catch (error) {
    console.warn(`Failed to get test details for ${referenceId}:`, error);
    return null;
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

export async function getSchema(_subcommand: string): Promise<any> {
  // For now, return a basic schema structure
  // This would normally fetch from xcresulttool help output
  return {
    type: 'object',
    properties: {
      testNodes: { type: 'array' },
      devices: { type: 'array' },
      testPlanConfigurations: { type: 'array' },
    },
  };
}
