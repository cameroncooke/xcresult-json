import { getSummary, getTestDetails } from './xcjson.js';
import { validateAndLog } from './validator.js';
import { Report, SuiteResult, TestResult } from './types/report.js';
import { execa } from 'execa';

// New xcresulttool format structures
interface NewTestNode {
  name: string;
  nodeIdentifier?: string;
  nodeIdentifierURL?: string;
  nodeType: 'Test Case' | 'Test Suite' | 'Unit test bundle' | 'Test Plan' | 'Arguments';
  result: 'Passed' | 'Failed' | 'Skipped';
  duration?: string;
  durationInSeconds?: number;
  children?: NewTestNode[];
}

interface NewTestData {
  devices: Array<{
    architecture: string;
    deviceId: string;
    deviceName: string;
    modelName: string;
    osBuildNumber: string;
    osVersion: string;
    platform: string;
  }>;
  testNodes: NewTestNode[];
  testPlanConfigurations: Array<{
    configurationId: string;
    configurationName: string;
  }>;
}

// Legacy format structures (for fallback)
interface TestNode {
  identifier?: { _value: string };
  testStatus?: { _value: string };
  duration?: { _value: number };
  subtests?: { _values?: TestNode[] };
  children?: { _values?: TestNode[] };
  summaryRef?: { id: { _value: string } };
}

interface TestableSummary {
  name?: { _value: string };
  tests?: { _values?: TestNode[] };
}

async function extractTestResult(
  test: TestNode,
  bundlePath: string,
  _suiteName: string
): Promise<TestResult | null> {
  // Skip if this is a container node (has subtests or children)
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
      const details = await getTestDetails(bundlePath, test.summaryRef.id._value);
      if (details) {
        const validated = validateAndLog(details, `test details for ${name}`);

        // Extract failure message from failureSummaries (the correct location)
        const failureSummaries = validated.failureSummaries?._values || [];

        if (failureSummaries.length > 0) {
          const firstFailure = failureSummaries[0];
          failureMessage = firstFailure.message?._value || 'Test failed';
        }

        // Fallback: check other summary locations
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

        // Last fallback: check activity summaries
        if (!failureMessage && validated.activitySummaries?._values) {
          for (const activity of validated.activitySummaries._values) {
            if (activity.title?._value && activity.title._value.includes('failed')) {
              failureMessage = activity.title._value;
              break;
            }
          }
        }

        // Final fallback: if we still don't have a message but got test details, use generic message
        if (!failureMessage) {
          failureMessage = 'Test failed';
        }
      }
    } catch (error) {
      // Continue without failure message if detail fetch fails
      console.warn(`Failed to get failure details for ${name}:`, error);
      // Don't set failureMessage if we can't get details
    }
  }

  return {
    name,
    status: status as 'Success' | 'Failure',
    duration,
    ...(failureMessage && { failureMessage }),
  };
}

async function collectTests(
  node: TestNode,
  bundlePath: string,
  suiteName: string,
  results: TestResult[]
): Promise<void> {
  // Process current node
  const result = await extractTestResult(node, bundlePath, suiteName);
  if (result) {
    results.push(result);
  }

  // Process subtests
  if (node.subtests?._values) {
    await Promise.all(
      node.subtests._values.map((subtest) => collectTests(subtest, bundlePath, suiteName, results))
    );
  }

  // Process children (some test formats use this)
  if (node.children?._values) {
    await Promise.all(
      node.children._values.map((child) => collectTests(child, bundlePath, suiteName, results))
    );
  }
}

async function parseSuite(summary: TestableSummary, bundlePath: string): Promise<SuiteResult> {
  const suiteName = summary.name?._value || 'Unknown Suite';
  const allTests: TestResult[] = [];

  // Collect all tests recursively
  if (summary.tests?._values) {
    await Promise.all(
      summary.tests._values.map((test) => collectTests(test, bundlePath, suiteName, allTests))
    );
  }

  // Separate passed and failed tests
  const failed = allTests.filter((test) => test.status === 'Failure');
  const passed = allTests.filter((test) => test.status === 'Success');

  // Calculate total duration (ensure numeric values)
  const duration = allTests.reduce(
    (sum, test) => sum + (typeof test.duration === 'number' ? test.duration : 0),
    0
  );

  return {
    suiteName,
    duration,
    failed,
    passed,
  };
}

// Helper function to recursively extract test cases from new format
function extractTestCases(node: NewTestNode): TestResult[] {
  const results: TestResult[] = [];

  if (node.nodeType === 'Test Case') {
    // This is an actual test case
    const duration = node.durationInSeconds ?? 0;
    const status = node.result === 'Passed' ? 'Success' : 'Failure';

    results.push({
      name: node.name,
      status,
      duration,
      failureMessage: node.result === 'Failed' ? `Test '${node.name}' failed` : undefined,
    });
  }

  // Recursively process children
  if (node.children) {
    for (const child of node.children) {
      results.push(...extractTestCases(child));
    }
  }

  return results;
}

// Helper function to create suite results from new format
function createSuiteFromNode(node: NewTestNode): SuiteResult[] {
  const suites: SuiteResult[] = [];

  if (node.nodeType === 'Test Suite') {
    // Extract all test cases from this suite
    const allTests = extractTestCases(node);
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
      suites.push(...createSuiteFromNode(child));
    }
  }

  return suites;
}


export async function parseXCResult(bundlePath: string): Promise<Report> {
  // For now, always use legacy format to get proper timing/location data
  // The new format doesn't include duration, file, or line information

  try {
    // Try to get legacy format data which has detailed timing info
    const { execa } = await import('execa');
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
    const summary = JSON.parse(stdout);

    // Use legacy format parsing
    return await parseLegacyFormat(summary, bundlePath);
  } catch {
    // Fallback to new format if legacy fails
    const summary = await getSummary(bundlePath);

    if (summary.testNodes && Array.isArray(summary.testNodes)) {
      return await parseNewFormat(summary, bundlePath);
    }

    // Fallback to old format for test fixtures and older xcresult files
    if (summary.issues?.testableSummaries?._values) {
      return await parseOldFormat(summary, bundlePath);
    }

    // Handle alternative data structures (actions-only path)
    if (summary.actions?._values) {
      return {
        totalSuites: 0,
        totalTests: 0,
        totalDuration: 0,
        suites: [],
      };
    }
  }

  throw new Error('Unable to parse xcresult in any supported format');
}

async function parseNewFormat(summary: any, _bundlePath: string): Promise<Report> {
  // New format
  const newData = summary as NewTestData;
  const suites: SuiteResult[] = [];

  // Process each test node
  for (const testNode of newData.testNodes) {
    suites.push(...createSuiteFromNode(testNode));
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

async function parseOldFormat(summary: any, bundlePath: string): Promise<Report> {
  // Old format from test fixtures - uses issues.testableSummaries structure
  const testSummaries = summary.issues?.testableSummaries?._values || [];
  const suites: SuiteResult[] = [];

  for (const testableSummary of testSummaries) {
    const suite = await parseSuite(testableSummary, bundlePath);
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

async function parseLegacyFormat(summary: any, bundlePath: string): Promise<Report> {
  // Legacy format - need to fetch detailed test data
  const validated = validateAndLog(summary, 'test summary');

  // Get action timing for total duration
  const action = validated.actions?._values?.[0];
  let totalActionDuration = 0;
  if (action?.startedTime?._value && action?.endedTime?._value) {
    const startTime = new Date(action.startedTime._value);
    const endTime = new Date(action.endedTime._value);
    totalActionDuration = (endTime.getTime() - startTime.getTime()) / 1000; // Convert to seconds
  }

  // Get the test reference ID
  const testsRef = action?.actionResult?.testsRef;

  if (!testsRef?.id?._value) {
    // No tests found
    return {
      totalSuites: 0,
      totalTests: 0,
      totalDuration: totalActionDuration,
      suites: [],
    };
  }

  // Fetch detailed test data using the reference
  const testDetails = await getTestDetails(bundlePath, testsRef.id._value);
  const testSummaries = testDetails?.summaries?._values || [];

  // Parse each testable summary
  const suites: SuiteResult[] = [];
  for (const testSummary of testSummaries) {
    if (testSummary.testableSummaries?._values) {
      for (const testableSummary of testSummary.testableSummaries._values) {
        const suite = await parseSuite(testableSummary, bundlePath);
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

  // Use action duration as total duration since individual test timing isn't reliably available
  const finalDuration = totalActionDuration;

  return {
    totalSuites,
    totalTests,
    totalDuration: finalDuration,
    suites,
  };
}
