import { getSummary } from './xcjson.js';
import { parserRegistry } from './formats/registry.js';
import { Report, SuiteResult } from './types/report.js';
import { ParsedReport } from './formats/types.js';

/**
 * Convert our internal parsed format to the public API format
 */
function convertToPublicFormat(parsed: ParsedReport): Report {
  const suites: SuiteResult[] = parsed.suites.map((suite) => ({
    suiteName: suite.suiteName,
    duration: suite.duration,
    failed: suite.failed.map((test) => ({
      name: test.name,
      status: test.status as 'Success' | 'Failure',
      duration: test.duration,
      ...(test.failureMessage && { failureMessage: test.failureMessage }),
    })),
    passed: suite.passed.map((test) => ({
      name: test.name,
      status: test.status as 'Success' | 'Failure',
      duration: test.duration,
    })),
  }));

  return {
    totalSuites: parsed.totalSuites,
    totalTests: parsed.totalTests,
    totalDuration: parsed.totalDuration,
    suites,
  };
}

export async function parseXCResult(bundlePath: string): Promise<Report> {
  // Get the raw xcresult data
  const data = await getSummary(bundlePath);

  // Use the parser registry to parse the data
  const parsedReport = await parserRegistry.parse(bundlePath, data);

  // Convert to public format
  return convertToPublicFormat(parsedReport);
}
