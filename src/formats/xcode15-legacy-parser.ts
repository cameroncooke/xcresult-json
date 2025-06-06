import { FormatParser, ParsedReport, ParsedSuiteResult, ParsedTestResult } from './types.js';
import { execa } from 'execa';

/**
 * Parser for Xcode 15.x xcresult format with --legacy flag
 * This is a fallback when the modern object format doesn't work
 */
export class Xcode15LegacyParser implements FormatParser {
  name = 'xcode15-legacy';
  priority = 85; // Lower priority than regular Xcode15Parser

  canParse(data: any): boolean {
    // Same structure as Xcode15Parser but will be tried as fallback
    return data?.actions?._values && Array.isArray(data.actions._values);
  }

  async parse(bundlePath: string, data: any): Promise<ParsedReport> {
    // Same implementation as Xcode15Parser
    const validated = data; // Skip validation to avoid circular imports

    // Get action timing for total duration
    const action = validated.actions?._values?.[0];
    let totalActionDuration = 0;
    if (action?.startedTime?._value && action?.endedTime?._value) {
      const startTime = new Date(action.startedTime._value);
      const endTime = new Date(action.endedTime._value);
      totalActionDuration = (endTime.getTime() - startTime.getTime()) / 1000;
    }

    // Get the test reference ID
    const testsRef = action?.actionResult?.testsRef;

    if (!testsRef?.id?._value) {
      return {
        totalSuites: 0,
        totalTests: 0,
        totalDuration: totalActionDuration,
        suites: [],
      };
    }

    // Fetch detailed test data using the reference
    const testDetails = await this.getTestDetails(bundlePath, testsRef.id._value);
    const testSummaries = testDetails?.summaries?._values || [];

    // Parse each testable summary
    const suites: ParsedSuiteResult[] = [];
    for (const testSummary of testSummaries) {
      if (testSummary.testableSummaries?._values) {
        for (const testableSummary of testSummary.testableSummaries._values) {
          const suite = await this.parseSuite(testableSummary, bundlePath);
          suites.push(suite);
        }
      }
    }

    // Calculate totals
    const totalSuites = suites.length;
    const totalTests = suites.reduce(
      (sum, suite) => sum + suite.failed.length + suite.passed.length,
      0
    );

    return {
      totalSuites,
      totalTests,
      totalDuration: totalActionDuration,
      suites,
    };
  }

  private async parseSuite(summary: any, bundlePath: string): Promise<ParsedSuiteResult> {
    const suiteName = summary.name?._value || 'Unknown Suite';
    const allTests: ParsedTestResult[] = [];

    // Collect all tests recursively
    if (summary.tests?._values) {
      await Promise.all(
        summary.tests._values.map((test: any) => this.collectTests(test, bundlePath, allTests))
      );
    }

    // Separate passed and failed tests
    const failed = allTests.filter((test) => test.status === 'Failure');
    const passed = allTests.filter((test) => test.status === 'Success');

    // Calculate total duration
    const duration = allTests.reduce((sum, test) => sum + test.duration, 0);

    return {
      suiteName,
      duration,
      failed,
      passed,
    };
  }

  private async collectTests(
    node: any,
    bundlePath: string,
    results: ParsedTestResult[]
  ): Promise<void> {
    // Process current node
    const result = await this.extractTestResult(node, bundlePath);
    if (result) {
      results.push(result);
    }

    // Process subtests
    if (node.subtests?._values) {
      await Promise.all(
        node.subtests._values.map((subtest: any) => this.collectTests(subtest, bundlePath, results))
      );
    }

    // Process children
    if (node.children?._values) {
      await Promise.all(
        node.children._values.map((child: any) => this.collectTests(child, bundlePath, results))
      );
    }
  }

  private async extractTestResult(test: any, bundlePath: string): Promise<ParsedTestResult | null> {
    // Skip if this is a container node
    if (test.subtests?._values?.length || test.children?._values?.length) {
      return null;
    }

    const name = test.identifier?._value || 'Unknown Test';
    const status = test.testStatus?._value || 'Unknown';
    const duration = typeof test.duration?._value === 'number' ? test.duration._value : 0;

    let failureMessage: string | undefined;

    // If test failed, get details
    if (status === 'Failure' && test.summaryRef?.id?._value) {
      try {
        const details = await this.getTestDetails(bundlePath, test.summaryRef.id._value);
        if (details) {
          const validated = details; // Skip validation to avoid circular imports

          // Extract failure message from failureSummaries
          const failureSummaries = validated.failureSummaries?._values || [];

          if (failureSummaries.length > 0) {
            const firstFailure = failureSummaries[0];
            failureMessage = firstFailure.message?._value || 'Test failed';
          }

          // Fallback to other summaries
          if (!failureMessage) {
            const summaries = validated.summaries?._values || [];
            const testFailureSummaries = validated.testFailureSummaries?._values || [];

            const allSummaries = [...summaries, ...testFailureSummaries];
            if (allSummaries.length > 0) {
              const firstSummary = allSummaries[0];
              failureMessage =
                firstSummary.message?._value || firstSummary.title?._value || 'Test failed';
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to get failure details for ${name}:`, error);
      }
    }

    return {
      name,
      status: this.mapStatus(status),
      duration,
      ...(failureMessage && { failureMessage }),
    };
  }

  private mapStatus(status: string): 'Success' | 'Failure' | 'Skipped' {
    switch (status) {
      case 'Success':
        return 'Success';
      case 'Failure':
        return 'Failure';
      case 'Skipped':
        return 'Skipped';
      default:
        return 'Failure';
    }
  }

  private async getTestDetails(bundlePath: string, referenceId: string): Promise<any> {
    // Use --legacy flag for this parser
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
    return JSON.parse(stdout);
  }
}

/**
 * Get test results using Xcode 15.x command format with --legacy flag
 */
export async function getXcode15LegacyTestResults(bundlePath: string): Promise<any> {
  try {
    const { stdout } = await execa('xcrun', [
      'xcresulttool',
      'get',
      'object',
      '--legacy',
      '--path',
      bundlePath,
      '--format',
      'json',
    ]);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Failed to get Xcode 15 legacy test results: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
