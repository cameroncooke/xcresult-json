import { execa } from 'execa';
import chalk from 'chalk';

export class XcjsonError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exitCode?: number
  ) {
    super(message);
    this.name = 'XcjsonError';
  }
}

interface XcrunCache {
  supportsTestReport?: boolean;
  supportsObject?: boolean;
  commandFormat?: 'modern' | 'legacy' | 'basic';
}

const cache: XcrunCache = {};

async function checkCapabilities(): Promise<{
  supportsTestReport: boolean;
  supportsObject: boolean;
  commandFormat: 'modern' | 'legacy' | 'basic';
}> {
  if (cache.commandFormat !== undefined) {
    return {
      supportsTestReport: cache.supportsTestReport!,
      supportsObject: cache.supportsObject!,
      commandFormat: cache.commandFormat
    };
  }

  try {
    // Check main help to see available commands
    const { stdout: mainHelp } = await execa('xcrun', ['xcresulttool', '--help']);
    
    // Try to get help for 'get' command
    let getHelp = '';
    try {
      const { stdout } = await execa('xcrun', ['xcresulttool', 'get', '--help']);
      getHelp = stdout;
    } catch {
      // 'get' command may not exist in older versions
    }

    // Determine capabilities
    const supportsTestReport = getHelp.includes('test-results');
    const supportsObject = getHelp.includes('object') || mainHelp.includes('object');
    
    let commandFormat: 'modern' | 'legacy' | 'basic';
    if (supportsTestReport) {
      commandFormat = 'modern';
    } else if (supportsObject) {
      commandFormat = 'legacy';
    } else {
      commandFormat = 'basic';
    }

    cache.supportsTestReport = supportsTestReport;
    cache.supportsObject = supportsObject;
    cache.commandFormat = commandFormat;

    return { supportsTestReport, supportsObject, commandFormat };
  } catch (error: any) {
    throw new XcjsonError(
      'Failed to run xcresulttool. Ensure Xcode is installed.',
      'XCRESULTTOOL_NOT_FOUND',
      1
    );
  }
}

export async function getSchema(subcommand: string): Promise<any> {
  try {
    const { supportsTestReport } = await checkCapabilities();
    const command = supportsTestReport ? 'test-results' : 'object';

    const { stdout } = await execa('xcrun', ['xcresulttool', 'help', 'get', command, subcommand]);

    // Extract JSON Schema section
    const schemaStart = stdout.indexOf('Command output structure (JSON Schema):');
    if (schemaStart === -1) {
      throw new XcjsonError(
        'Could not find JSON Schema in xcresulttool help output',
        'SCHEMA_NOT_FOUND'
      );
    }

    const jsonStart = stdout.indexOf('{', schemaStart);
    if (jsonStart === -1) {
      throw new XcjsonError(
        'Could not find JSON Schema start in help output',
        'SCHEMA_PARSE_ERROR'
      );
    }

    // Find matching closing brace
    let braceCount = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < stdout.length; i++) {
      if (stdout[i] === '{') braceCount++;
      if (stdout[i] === '}') braceCount--;
      if (braceCount === 0) {
        jsonEnd = i;
        break;
      }
    }

    const jsonString = stdout.substring(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(jsonString);
    } catch {
      throw new XcjsonError('Failed to parse JSON Schema', 'SCHEMA_PARSE_ERROR');
    }
  } catch (error: any) {
    if (error instanceof XcjsonError) {
      throw error;
    }
    if (error.message?.includes('not found')) {
      throw new XcjsonError(
        'Failed to run xcresulttool. Ensure Xcode is installed.',
        'XCRESULTTOOL_NOT_FOUND',
        1
      );
    }
    throw new XcjsonError(
      `Failed to get schema: ${error.message}`,
      'SCHEMA_FETCH_ERROR',
      error.exitCode
    );
  }
}

const resultCache = new Map<string, any>();
let cacheEnabled = true;

export async function getSummary(bundlePath: string): Promise<any> {
  const cacheKey = `summary:${bundlePath}`;
  if (cacheEnabled && resultCache.has(cacheKey)) {
    return resultCache.get(cacheKey);
  }

  try {
    const { supportsTestReport, supportsObject, commandFormat } = await checkCapabilities();
    
    let args: string[];
    if (supportsTestReport) {
      // Modern format: test-results
      args = ['xcresulttool', 'get', 'test-results', 'tests', '--path', bundlePath];
    } else if (supportsObject) {
      // Legacy format: object with --legacy flag
      args = ['xcresulttool', 'get', 'object', '--legacy', '--path', bundlePath, '--format', 'json'];
    } else {
      // Very old format: try basic object command
      args = ['xcresulttool', 'get', '--path', bundlePath, '--format', 'json'];
    }

    const { stdout } = await execa('xcrun', args);
    const result = JSON.parse(stdout);
    if (cacheEnabled) {
      resultCache.set(cacheKey, result);
    }
    return result;
  } catch (error: any) {
    if (error instanceof XcjsonError) {
      throw error; // Re-throw XcjsonError as-is (e.g., from checkCapabilities)
    }
    if (error.exitCode === 1 && error.stderr?.includes('not a valid .xcresult bundle')) {
      throw new XcjsonError(`Invalid xcresult bundle: ${bundlePath}`, 'INVALID_BUNDLE', 2);
    }
    if (error.message?.includes('not found') || error.message?.includes('xcresulttool not found')) {
      throw new XcjsonError(
        'Failed to run xcresulttool. Ensure Xcode is installed.',
        'XCRESULTTOOL_NOT_FOUND',
        1
      );
    }
    throw new XcjsonError(
      `Failed to get test summary: ${error.message}`,
      'SUMMARY_FETCH_ERROR',
      error.exitCode
    );
  }
}

export async function getTestDetails(bundlePath: string, testId: string): Promise<any> {
  const cacheKey = `detail:${bundlePath}:${testId}`;
  if (cacheEnabled && resultCache.has(cacheKey)) {
    return resultCache.get(cacheKey);
  }

  try {
    const { supportsTestReport, supportsObject, commandFormat } = await checkCapabilities();
    
    let args: string[];
    if (supportsTestReport) {
      // Modern format: test-results test-details
      args = [
        'xcresulttool',
        'get',
        'test-results',
        'test-details',
        '--test-id',
        testId,
        '--path',
        bundlePath,
      ];
    } else if (supportsObject) {
      // Legacy format: object with --legacy flag
      args = [
        'xcresulttool',
        'get',
        'object',
        '--legacy',
        '--path',
        bundlePath,
        '--id',
        testId,
        '--format',
        'json',
      ];
    } else {
      // Very old format: try basic get command
      args = [
        'xcresulttool',
        'get',
        '--path',
        bundlePath,
        '--id',
        testId,
        '--format',
        'json',
      ];
    }

    const { stdout } = await execa('xcrun', args);
    const result = JSON.parse(stdout);
    if (cacheEnabled) {
      resultCache.set(cacheKey, result);
    }
    return result;
  } catch (error: any) {
    console.warn(
      chalk.yellow(`Warning: Failed to get test details for ${testId}: ${error.message}`)
    );
    return null;
  }
}

export function clearCache(): void {
  resultCache.clear();
  delete cache.supportsTestReport;
}

export function disableCache(): void {
  cacheEnabled = false;
  clearCache();
}

export function enableCache(): void {
  cacheEnabled = true;
}
