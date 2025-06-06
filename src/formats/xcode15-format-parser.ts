/**
 * Xcode 15.x format parser - handles object format with actions structure
 */

import { FormatParser } from '../core/interfaces.js';
import { Report } from '../types/report.js';

export class Xcode15FormatParser implements FormatParser {
  readonly name = 'xcode15';
  readonly priority = 90; // Second priority

  canParse(data: any): boolean {
    // Xcode 15 format has actions._values structure (modern object format)
    return !!(data?.actions?._values && Array.isArray(data.actions._values));
  }

  async parse(_bundlePath: string, data: any): Promise<Report> {
    // Get action timing for total duration
    const action = data.actions?._values?.[0];
    let totalActionDuration = 0;
    if (action?.startedTime?._value && action?.endedTime?._value) {
      const startTime = new Date(action.startedTime._value);
      const endTime = new Date(action.endedTime._value);
      totalActionDuration = (endTime.getTime() - startTime.getTime()) / 1000; // Convert to seconds
    }

    // For now, return minimal structure as we don't have real test details
    // In production, this would fetch test details using testsRef
    const suites: any[] = [];

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
}
