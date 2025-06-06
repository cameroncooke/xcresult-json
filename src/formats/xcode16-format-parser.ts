/**
 * Xcode 16+ format parser - handles modern test-results format
 */

import { FormatParser } from '../core/interfaces.js';
import { Report } from '../types/report.js';
import { execa } from 'execa';

export class Xcode16FormatParser implements FormatParser {
  readonly name = 'xcode16';
  readonly priority = 100; // Highest priority - try this first

  canParse(data: any): boolean {
    // Xcode 16 summary format has devicesAndConfigurations array and test statistics
    return !!(
      data?.devicesAndConfigurations &&
      Array.isArray(data.devicesAndConfigurations) &&
      typeof data?.passedTests === 'number' &&
      typeof data?.failedTests === 'number'
    );
  }

  async parse(bundlePath: string, data: any): Promise<Report> {
    // Data is the summary, we need to get detailed test structure
    const testDetails = await this.getTestDetails(bundlePath);

    // Extract basic metrics from summary
    const totalTests = (data.passedTests || 0) + (data.failedTests || 0) + (data.skippedTests || 0);
    const totalDuration = this.calculateDuration(data.startTime, data.finishTime);

    // Parse test structure from detailed tests
    const suites = this.parseTestNodes(testDetails.testNodes || [], data.testFailures || []);

    return {
      totalSuites: suites.length,
      totalTests,
      totalDuration,
      suites,
    };
  }

  private async getTestDetails(bundlePath: string): Promise<any> {
    try {
      const { stdout } = await execa('xcrun', [
        'xcresulttool',
        'get',
        'test-results',
        'tests',
        '--path',
        bundlePath,
        '--format',
        'json',
      ]);
      return JSON.parse(stdout);
    } catch {
      console.warn('Failed to get detailed test structure, using summary only');
      return { testNodes: [] };
    }
  }

  private calculateDuration(startTime?: number, finishTime?: number): number {
    if (startTime && finishTime) {
      return finishTime - startTime;
    }
    return 0;
  }

  private parseTestNodes(testNodes: any[], testFailures: any[]): any[] {
    const suites: any[] = [];

    // Create a map of failures by test identifier for quick lookup
    const failureMap = new Map<string, any>();
    testFailures.forEach((failure) => {
      failureMap.set(failure.testIdentifierString || failure.testIdentifier, failure);
    });

    for (const node of testNodes) {
      suites.push(...this.createSuitesFromNode(node, failureMap));
    }

    return suites;
  }

  private createSuitesFromNode(node: any, failureMap: Map<string, any>): any[] {
    const suites: any[] = [];

    if (node.nodeType === 'Test Suite') {
      // Extract all test cases from this suite
      const allTests = this.extractTestCases(node, failureMap);
      const passed = allTests.filter((test) => test.status === 'Success');
      const failed = allTests.filter((test) => test.status === 'Failure');
      const duration = allTests.reduce((sum, test) => sum + test.duration, 0);

      suites.push({
        suiteName: node.name || 'Unknown Suite',
        duration,
        failed,
        passed,
      });
    } else if (node.children) {
      // This is a container (like Test Plan, Unit test bundle), process children
      for (const child of node.children) {
        suites.push(...this.createSuitesFromNode(child, failureMap));
      }
    }

    return suites;
  }

  private extractTestCases(node: any, failureMap: Map<string, any>): any[] {
    const results: any[] = [];

    if (node.nodeType === 'Test Case') {
      // This is an actual test case
      const duration = node.durationInSeconds ?? 0;
      const status = this.mapStatus(node.result);
      const identifier = node.nodeIdentifier || node.name;

      // Get failure message if this test failed
      let failureMessage: string | undefined;
      if (status === 'Failure') {
        const failure = failureMap.get(identifier);
        failureMessage = failure?.failureText || `Test '${node.name}' failed`;
      }

      results.push({
        name: node.name || identifier,
        status,
        duration,
        ...(failureMessage && { failureMessage }),
      });
    }

    // Recursively process children
    if (node.children) {
      for (const child of node.children) {
        results.push(...this.extractTestCases(child, failureMap));
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
}
