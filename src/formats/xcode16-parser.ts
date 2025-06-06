import { FormatParser, ParsedReport, ParsedSuiteResult, ParsedTestResult } from './types.js';
import { execa } from 'execa';

/**
 * Parser for Xcode 16+ xcresult format
 * Uses the new `xcresulttool get test-results` command
 */
export class Xcode16Parser implements FormatParser {
  name = 'xcode16';
  priority = 100; // Highest priority - try this first

  canParse(data: any): boolean {
    // Xcode 16 format has testNodes array at the root
    return data?.testNodes && Array.isArray(data.testNodes);
  }

  async parse(_bundlePath: string, data: any): Promise<ParsedReport> {
    const suites: ParsedSuiteResult[] = [];

    // Process each test node
    for (const testNode of data.testNodes) {
      suites.push(...this.createSuitesFromNode(testNode));
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

  private createSuitesFromNode(node: any): ParsedSuiteResult[] {
    const suites: ParsedSuiteResult[] = [];

    if (node.nodeType === 'Test Suite') {
      // Extract all test cases from this suite
      const allTests = this.extractTestCases(node);
      const passed = allTests.filter((test) => test.status === 'Success');
      const failed = allTests.filter((test) => test.status === 'Failure');
      const duration = allTests.reduce((sum, test) => sum + test.duration, 0);

      suites.push({
        suiteName: node.name,
        duration,
        failed,
        passed,
      });
    } else if (node.children) {
      // This is a container (like Test Plan, Unit test bundle), process children
      for (const child of node.children) {
        suites.push(...this.createSuitesFromNode(child));
      }
    }

    return suites;
  }

  private extractTestCases(node: any): ParsedTestResult[] {
    const results: ParsedTestResult[] = [];

    if (node.nodeType === 'Test Case') {
      // This is an actual test case
      const duration = node.durationInSeconds ?? 0;
      const status = this.mapStatus(node.result);

      results.push({
        name: node.name,
        status,
        duration,
        failureMessage: node.result === 'Failed' ? this.getFailureMessage(node) : undefined,
      });
    }

    // Recursively process children
    if (node.children) {
      for (const child of node.children) {
        results.push(...this.extractTestCases(child));
      }
    }

    return results;
  }

  private mapStatus(result: string): 'Success' | 'Failure' | 'Skipped' {
    switch (result) {
      case 'Passed':
        return 'Success';
      case 'Failed':
        return 'Failure';
      case 'Skipped':
        return 'Skipped';
      default:
        return 'Failure';
    }
  }

  private getFailureMessage(node: any): string {
    // For now, return a generic message
    // In future, we can fetch detailed failure info if available
    return `Test '${node.name}' failed`;
  }
}

/**
 * Get test results using Xcode 16+ command format
 */
export async function getXcode16TestResults(bundlePath: string): Promise<any> {
  try {
    const { stdout } = await execa('xcrun', [
      'xcresulttool',
      'get',
      'test-results',
      '--path',
      bundlePath,
      '--format',
      'json',
    ]);
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to get Xcode 16 test results: ${error instanceof Error ? error.message : String(error)}`);
  }
}