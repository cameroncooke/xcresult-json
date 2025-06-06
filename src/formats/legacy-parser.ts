import { FormatParser, ParsedReport, ParsedSuiteResult, ParsedTestResult } from './types.js';

/**
 * Parser for legacy xcresult format (test fixtures and older files)
 * This format uses issues.testableSummaries structure
 */
export class LegacyParser implements FormatParser {
  name = 'legacy';
  priority = 80; // Third priority

  canParse(data: any): boolean {
    // Legacy format has issues.testableSummaries structure
    return data?.issues?.testableSummaries?._values && Array.isArray(data.issues.testableSummaries._values);
  }

  async parse(_bundlePath: string, data: any): Promise<ParsedReport> {
    const testSummaries = data.issues?.testableSummaries?._values || [];
    const suites: ParsedSuiteResult[] = [];

    for (const testableSummary of testSummaries) {
      const suite = await this.parseSuite(testableSummary);
      suites.push(suite);
    }

    // Calculate totals
    const totalSuites = suites.length;
    const totalTests = suites.reduce(
      (sum, suite) => sum + suite.failed.length + suite.passed.length,
      0
    );
    const totalDuration = suites.reduce((sum, suite) => sum + suite.duration, 0);

    return {
      totalSuites,
      totalTests,
      totalDuration,
      suites,
    };
  }

  private async parseSuite(summary: any): Promise<ParsedSuiteResult> {
    const suiteName = summary.name?._value || 'Unknown Suite';
    const allTests: ParsedTestResult[] = [];

    // Collect all tests recursively
    if (summary.tests?._values) {
      await Promise.all(
        summary.tests._values.map((test: any) => this.collectTests(test, allTests))
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

  private async collectTests(node: any, results: ParsedTestResult[]): Promise<void> {
    // Process current node
    const result = await this.extractTestResult(node);
    if (result) {
      results.push(result);
    }

    // Process subtests
    if (node.subtests?._values) {
      await Promise.all(
        node.subtests._values.map((subtest: any) => this.collectTests(subtest, results))
      );
    }

    // Process children
    if (node.children?._values) {
      await Promise.all(
        node.children._values.map((child: any) => this.collectTests(child, results))
      );
    }
  }

  private async extractTestResult(test: any): Promise<ParsedTestResult | null> {
    // Skip if this is a container node (has subtests or children)
    if (test.subtests?._values?.length || test.children?._values?.length) {
      return null;
    }

    const name = test.identifier?._value || 'Unknown Test';
    const status = test.testStatus?._value || 'Unknown';
    const duration = typeof test.duration?._value === 'number' ? test.duration._value : 0;

    // Legacy format doesn't have detailed failure messages in test fixtures
    const failureMessage = status === 'Failure' ? 'Test failed' : undefined;

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
}