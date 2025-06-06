/**
 * Legacy format parser - handles JSON test fixtures and older xcresult formats
 */

import { FormatParser } from '../core/interfaces.js';
import { Report } from '../types/report.js';

export class LegacyFormatParser implements FormatParser {
  readonly name = 'legacy';
  readonly priority = 80;

  canParse(data: any): boolean {
    // Legacy format has issues.testableSummaries structure
    return !!(
      data?.issues?.testableSummaries?._values &&
      Array.isArray(data.issues.testableSummaries._values)
    );
  }

  async parse(_bundlePath: string, data: any): Promise<Report> {
    const testSummaries = data.issues?.testableSummaries?._values || [];
    const suites: any[] = [];

    for (const testableSummary of testSummaries) {
      const suite = this.parseSuite(testableSummary);
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

  private parseSuite(summary: any): any {
    const suiteName = summary.name?._value || 'Unknown Suite';
    const allTests: any[] = [];

    // Collect all tests recursively
    if (summary.tests?._values) {
      summary.tests._values.forEach((test: any) => this.collectTests(test, allTests));
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

  private collectTests(node: any, results: any[]): void {
    // Process current node
    const result = this.extractTestResult(node);
    if (result) {
      results.push(result);
    }

    // Process subtests
    if (node.subtests?._values) {
      node.subtests._values.forEach((subtest: any) => this.collectTests(subtest, results));
    }

    // Process children
    if (node.children?._values) {
      node.children._values.forEach((child: any) => this.collectTests(child, results));
    }
  }

  private extractTestResult(test: any): any | null {
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