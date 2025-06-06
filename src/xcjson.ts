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
      commandFormat: cache.commandFormat,
    };
  }

  try {
    // Get version to determine capabilities based on known version differences
    const { stdout: versionOutput } = await execa('xcrun', ['xcresulttool', 'version']);
    const versionMatch = versionOutput.match(/version (\d+)/);
    const version = versionMatch ? parseInt(versionMatch[1]) : 0;

    // Check main help to see available commands
    const { stdout: mainHelp } = await execa('xcrun', ['xcresulttool', '--help']);
    
    let supportsTestReport = false;
    let supportsObject = false;
    let commandFormat: 'modern' | 'legacy' | 'basic' = 'basic';

    if (version >= 23000) {
      // Modern versions (23000+) - has get subcommands like 'test-results' and 'object'
      try {
        const { stdout: getHelp } = await execa('xcrun', ['xcresulttool', 'get', '--help']);
        supportsTestReport = getHelp.includes('test-results');
        supportsObject = getHelp.includes('object');
        commandFormat = supportsTestReport ? 'modern' : 'legacy';
      } catch {
        // Fallback if get command structure is different
        supportsObject = mainHelp.includes('get');
        commandFormat = 'basic';
      }
    } else if (version >= 22000) {
      // Older versions (22000-22999) - 'get' is a direct command, no subcommands
      // These versions don't support 'get object --legacy' syntax
      supportsObject = mainHelp.includes('get');
      supportsTestReport = false; // test-results not available in older versions
      commandFormat = 'basic';
    } else {
      // Very old versions - minimal support
      supportsObject = mainHelp.includes('get');
      commandFormat = 'basic';
    }

    cache.supportsTestReport = supportsTestReport;
    cache.supportsObject = supportsObject;
    cache.commandFormat = commandFormat;

    return { supportsTestReport, supportsObject, commandFormat };
  } catch {
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
    
    let args: string[];
    if (supportsTestReport) {
      // Modern format: test-results supports subcommands like 'tests'
      args = ['xcresulttool', 'help', 'get', 'test-results', subcommand];
    } else {
      // Legacy format: object command doesn't have subcommands, get general help
      args = ['xcresulttool', 'help', 'get', 'object'];
    }

    const { stdout } = await execa('xcrun', args);

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

    // Find the end of JSON by looking for the USAGE section
    const usageStart = stdout.indexOf('\nUSAGE:', jsonStart);
    if (usageStart === -1) {
      throw new XcjsonError(
        'Could not find end of JSON Schema in help output',
        'SCHEMA_PARSE_ERROR'
      );
    }

    // Extract JSON text and clean up any trailing whitespace
    const jsonString = stdout.substring(jsonStart, usageStart).trim();
    
    try {
      return JSON.parse(jsonString);
    } catch (parseError: any) {
      // If JSON parsing fails, the string might have unescaped newlines in descriptions
      // Handle the specific case where Apple's xcresulttool outputs malformed JSON with embedded newlines
      const fixedJsonString = jsonString
        .replace(
          /"Human-readable duration with optional\ncomponents of days, hours, minutes and seconds"/g,
          '"Human-readable duration with optional\\ncomponents of days, hours, minutes and seconds"'
        );
      
      try {
        return JSON.parse(fixedJsonString);
      } catch {
        throw new XcjsonError('Failed to parse JSON Schema', 'SCHEMA_PARSE_ERROR');
      }
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
    } else if (supportsObject && commandFormat === 'legacy') {
      // Legacy format: object with --legacy flag (version 23000+)
      args = [
        'xcresulttool',
        'get',
        'object',
        '--legacy',
        '--path',
        bundlePath,
        '--format',
        'json',
      ];
    } else if (supportsObject && commandFormat === 'basic') {
      // Basic format: direct get command (version 22000-22999)
      args = ['xcresulttool', 'get', '--path', bundlePath, '--format', 'json'];
    } else {
      // Fallback: try the most basic format
      args = ['xcresulttool', 'get', '--path', bundlePath];
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
    } else if (supportsObject && commandFormat === 'legacy') {
      // Legacy format: object with --legacy flag (version 23000+)
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
    } else if (supportsObject && commandFormat === 'basic') {
      // Basic format: direct get command (version 22000-22999)
      args = ['xcresulttool', 'get', '--path', bundlePath, '--id', testId, '--format', 'json'];
    } else {
      // Fallback: try the most basic format
      args = ['xcresulttool', 'get', '--path', bundlePath, '--id', testId];
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
