/**
 * Xcode 16+ format parser - handles modern test-results format
 */

import { FormatParser } from '../core/interfaces.js';
import { Report } from '../types/report.js';

export class Xcode16FormatParser implements FormatParser {
  readonly name = 'xcode16';
  readonly priority = 100; // Highest priority - try this first

  canParse(data: any): boolean {
    // Xcode 16 format has testNodes array at the root
    return !!(data?.testNodes && Array.isArray(data.testNodes));
  }

  async parse(_bundlePath: string, data: any): Promise<Report> {
    const suites: any[] = [];

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

  private createSuitesFromNode(node: any): any[] {
    const suites: any[] = [];

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

  private extractTestCases(node: any): any[] {
    const results: any[] = [];

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