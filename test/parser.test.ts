import { parseXCResult } from '../src/parser';
import * as xcjson from '../src/xcjson';
import { Report } from '../src/types/report';
import simpleTestFixture from './fixtures/simple-test.json';

jest.mock('../src/xcjson');

describe('parseXCResult', () => {
  const mockGetSummary = xcjson.getSummary as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default getSummary mock to return test fixture data
    mockGetSummary.mockResolvedValue(simpleTestFixture);
  });

  it('should parse a simple test result using legacy format', async () => {
    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result).toEqual({
      totalSuites: 1,
      totalTests: 2,
      totalDuration: 0.579,
      suites: [
        {
          suiteName: 'MyAppTests',
          duration: 0.579,
          failed: [
            {
              name: 'MyAppTests.testFailure',
              status: 'Failure',
              duration: 0.456,
              failureMessage: 'Test failed',
            },
          ],
          passed: [
            {
              name: 'MyAppTests.testExample',
              status: 'Success',
              duration: 0.123,
            },
          ],
        },
      ],
    });

    expect(mockGetSummary).toHaveBeenCalledWith('/path/to/test.xcresult');
  });

  it('should handle Xcode 16 format data', async () => {
    const xcode16Data = {
      testNodes: [
        {
          nodeType: 'Test Suite',
          name: 'TestSuite',
          children: [
            {
              nodeType: 'Test Case',
              name: 'testExample',
              result: 'Passed',
              durationInSeconds: 0.1,
            },
          ],
        },
      ],
    };

    mockGetSummary.mockResolvedValue(xcode16Data);

    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalSuites).toBe(1);
    expect(result.totalTests).toBe(1);
    expect(result.suites[0].suiteName).toBe('TestSuite');
    expect(result.suites[0].passed).toHaveLength(1);
    expect(result.suites[0].passed[0].name).toBe('testExample');
  });

  it('should handle Xcode 15 format data', async () => {
    const xcode15Data = {
      actions: {
        _values: [
          {
            startedTime: { _value: '2024-01-01T10:00:00.000Z' },
            endedTime: { _value: '2024-01-01T10:00:01.000Z' },
            actionResult: {
              testsRef: {
                id: { _value: 'test-ref-id' },
              },
            },
          },
        ],
      },
    };

    mockGetSummary.mockResolvedValue(xcode15Data);

    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalSuites).toBe(0);
    expect(result.totalTests).toBe(0);
    expect(result.totalDuration).toBe(1); // 1 second difference
  });

  it('should handle empty test data', async () => {
    const emptyData = {
      actions: {
        _values: [
          {
            startedTime: { _value: '2024-01-01T10:00:00.000Z' },
            endedTime: { _value: '2024-01-01T10:00:01.000Z' },
            actionResult: {},
          },
        ],
      },
    };

    mockGetSummary.mockResolvedValue(emptyData);

    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalSuites).toBe(0);
    expect(result.totalTests).toBe(0);
    expect(result.totalDuration).toBe(1);
    expect(result.suites).toEqual([]);
  });

  it('should throw error for unsupported format', async () => {
    const unsupportedData = {
      unknownFormat: true,
    };

    mockGetSummary.mockResolvedValue(unsupportedData);

    await expect(parseXCResult('/path/to/test.xcresult')).rejects.toThrow(
      'No parser could handle the xcresult format'
    );
  });

  it('should handle format detection and fallback', async () => {
    // First try Xcode 16 format, then fall back to legacy
    mockGetSummary.mockResolvedValue(simpleTestFixture);

    const result: Report = await parseXCResult('/path/to/test.xcresult');

    // Should successfully parse with legacy parser
    expect(result.totalSuites).toBe(1);
    expect(result.totalTests).toBe(2);
    expect(result.suites[0].suiteName).toBe('MyAppTests');
  });

  it('should preserve test timing data', async () => {
    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalDuration).toBe(0.579);
    expect(result.suites[0].duration).toBe(0.579);
    expect(result.suites[0].passed[0].duration).toBe(0.123);
    expect(result.suites[0].failed[0].duration).toBe(0.456);
  });

  it('should preserve failure messages', async () => {
    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].failed).toHaveLength(1);
    expect(result.suites[0].failed[0].failureMessage).toBe('Test failed');
  });

  it('should handle multiple test suites', async () => {
    const multiSuiteData = {
      issues: {
        testableSummaries: {
          _values: [
            {
              name: { _value: 'Suite1' },
              tests: {
                _values: [
                  {
                    identifier: { _value: 'test1' },
                    testStatus: { _value: 'Success' },
                    duration: { _value: 0.1 },
                  },
                ],
              },
            },
            {
              name: { _value: 'Suite2' },
              tests: {
                _values: [
                  {
                    identifier: { _value: 'test2' },
                    testStatus: { _value: 'Failure' },
                    duration: { _value: 0.2 },
                  },
                ],
              },
            },
          ],
        },
      },
    };

    mockGetSummary.mockResolvedValue(multiSuiteData);

    const result: Report = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalSuites).toBe(2);
    expect(result.totalTests).toBe(2);
    expect(result.suites).toHaveLength(2);
    expect(result.suites[0].suiteName).toBe('Suite1');
    expect(result.suites[1].suiteName).toBe('Suite2');
  });
});