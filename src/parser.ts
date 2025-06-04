import { getSummary, getTestDetails } from './xcjson.js';
import { validateAndLog } from './validator.js';
import { Report, SuiteResult, TestResult } from './types/report.js';

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
  const duration = test.duration?._value || 0;

  // Default values
  let file = 'Unknown';
  let line = 1;
  let failureMessage: string | undefined;

  // If test failed, get details
  if (status === 'Failure' && test.summaryRef?.id?._value) {
    try {
      const details = await getTestDetails(bundlePath, test.summaryRef.id._value);
      if (details) {
        const validated = validateAndLog(details, `test details for ${name}`);

        // Extract failure message
        const failureSummaries = validated.summaries?._values || [];
        const testFailureSummaries = validated.testFailureSummaries?._values || [];

        const allSummaries = [...failureSummaries, ...testFailureSummaries];
        if (allSummaries.length > 0) {
          const firstSummary = allSummaries[0];
          failureMessage =
            firstSummary.message?._value || firstSummary.producingTarget?._value || 'Test failed';
        }

        // Extract location if available
        if (validated.location?._value) {
          file = validated.location._value.fileName?._value || file;
          line = validated.location._value.lineNumber?._value || line;
        }
      }
    } catch {
      // Continue with default values if detail fetch fails
    }
  }

  return {
    name,
    status: status as 'Success' | 'Failure',
    duration,
    file,
    line,
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

  // Calculate total duration
  const duration = allTests.reduce((sum, test) => sum + test.duration, 0);

  return {
    suiteName,
    duration,
    failed,
    passed,
  };
}

export async function parseXCResult(bundlePath: string): Promise<Report> {
  // Get test summary
  const summary = await getSummary(bundlePath);
  const validated = validateAndLog(summary, 'test summary');

  // Extract testable summaries
  const testableSummaries =
    validated.issues?.testableSummaries?._values ||
    validated.actions?._values?.[0]?.actionResult?.testsRef?.id?._value ||
    [];

  // Parse each suite
  const suites = await Promise.all(
    testableSummaries.map((summary: TestableSummary) => parseSuite(summary, bundlePath))
  );

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
