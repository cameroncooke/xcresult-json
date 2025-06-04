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
}

const cache: XcrunCache = {};

async function checkCapabilities(): Promise<boolean> {
  if (cache.supportsTestReport !== undefined) {
    return cache.supportsTestReport;
  }

  try {
    const { stdout } = await execa('xcrun', ['xcresulttool', '-h']);
    cache.supportsTestReport = stdout.includes('test-report');
    return cache.supportsTestReport;
  } catch {
    throw new XcjsonError(
      'Failed to run xcresulttool. Ensure Xcode is installed.',
      'XCRESULTTOOL_NOT_FOUND',
      1
    );
  }
}

export async function getSchema(subcommand: string): Promise<any> {
  const supportsTestReport = await checkCapabilities();
  const command = supportsTestReport ? 'test-report' : 'tests';

  try {
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
    throw new XcjsonError(
      `Failed to get schema: ${error.message}`,
      'SCHEMA_FETCH_ERROR',
      error.exitCode
    );
  }
}

const resultCache = new Map<string, any>();

export async function getSummary(bundlePath: string): Promise<any> {
  const cacheKey = `summary:${bundlePath}`;
  if (resultCache.has(cacheKey)) {
    return resultCache.get(cacheKey);
  }

  const supportsTestReport = await checkCapabilities();
  const args = supportsTestReport
    ? ['xcresulttool', 'get', 'test-report', 'tests', '--path', bundlePath, '--format', 'json']
    : ['xcresulttool', 'get', '--path', bundlePath, '--format', 'json'];

  try {
    const { stdout } = await execa('xcrun', args);
    const result = JSON.parse(stdout);
    resultCache.set(cacheKey, result);
    return result;
  } catch (error: any) {
    if (error.exitCode === 1 && error.stderr?.includes('not a valid .xcresult bundle')) {
      throw new XcjsonError(`Invalid xcresult bundle: ${bundlePath}`, 'INVALID_BUNDLE', 2);
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
  if (resultCache.has(cacheKey)) {
    return resultCache.get(cacheKey);
  }

  const supportsTestReport = await checkCapabilities();
  const args = supportsTestReport
    ? [
        'xcresulttool',
        'get',
        'test-report',
        'test',
        '--id',
        testId,
        '--path',
        bundlePath,
        '--format',
        'json',
      ]
    : ['xcresulttool', 'get', '--path', bundlePath, '--id', testId, '--format', 'json'];

  try {
    const { stdout } = await execa('xcrun', args);
    const result = JSON.parse(stdout);
    resultCache.set(cacheKey, result);
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
}
