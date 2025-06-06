import { parseXCResult } from '../src/parser';
import * as xcjson from '../src/xcjson';
import * as validator from '../src/validator';
import { Report } from '../src/types/report';
import simpleTestFixture from './fixtures/simple-test.json';
import testDetailsFixture from './fixtures/test-details.json';

jest.mock('../src/xcjson');
jest.mock('../src/validator');
jest.mock('execa');

describe('parseXCResult', () => {
  const mockGetSummary = xcjson.getSummary as jest.Mock;
  const mockGetTestDetails = xcjson.getTestDetails as jest.Mock;
  const mockInitializeValidator = validator.initializeValidator as jest.Mock;
  const mockValidateAndLog = validator.validateAndLog as jest.Mock;
  
  // Mock execa for legacy format calls
  const mockExeca = require('execa').execa as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeValidator.mockResolvedValue(undefined);
    mockValidateAndLog.mockImplementation((data) => data);
    
    // Setup default getSummary mock to return test fixture data
    mockGetSummary.mockResolvedValue(simpleTestFixture);
    mockGetTestDetails.mockResolvedValue(testDetailsFixture);
    
    // Mock execa to handle both legacy format calls and test detail calls
    mockExeca.mockImplementation((_command: string, args: string[]) => {
      // Fail the initial legacy format call to force fallback to getSummary
      if (args.includes('--legacy') && !args.includes('--id')) {
        return Promise.reject(new Error('xcresulttool legacy format not available'));
      }
      
      // Allow test detail calls with --id to succeed with specific responses
      if (args.includes('--id')) {
        const idIndex = args.findIndex(arg => arg === '--id');
        const testId = args[idIndex + 1];
        
        // Return different responses based on test ID
        if (testId === 'subtest-failure-id') {
          return Promise.resolve({
            stdout: JSON.stringify({
              failureSummaries: {
                _values: [{
                  message: { _value: 'Subtest assertion failed' }
                }]
              }
            })
          });
        }
        
        if (testId === 'testfailuresummaries-id') {
          return Promise.resolve({
            stdout: JSON.stringify({
              testFailureSummaries: {
                _values: [{
                  message: { _value: 'Test failure from testFailureSummaries' }
                }]
              }
            })
          });
        }
        
        if (testId === 'target-failure-id') {
          return Promise.resolve({
            stdout: JSON.stringify({
              summaries: {
                _values: [{
                  title: { _value: 'Target failure message' }
                }]
              }
            })
          });
        }
        
        if (testId === 'no-message-id') {
          return Promise.resolve({
            stdout: JSON.stringify({
              // No failure summaries - should get 'Test failed' fallback
            })
          });
        }
        
        // Default to original test fixture
        return Promise.resolve({
          stdout: JSON.stringify(testDetailsFixture)
        });
      }
      
      // Default rejection for unexpected calls
      return Promise.reject(new Error('Unexpected execa call'));
    });
  });

  it('should parse a simple test result', async () => {
    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result).toMatchObject<Report>({
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
              failureMessage: 'XCTAssertEqual failed: ("1") is not equal to ("2")',
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
  });

  it('should handle missing test details gracefully', async () => {
    // Override execa mock to fail test detail calls
    mockExeca.mockImplementation((_command: string, args: string[]) => {
      if (args.includes('--legacy') && !args.includes('--id')) {
        return Promise.reject(new Error('xcresulttool legacy format not available'));
      }
      if (args.includes('--id')) {
        return Promise.reject(new Error('Failed to get test details'));
      }
      return Promise.reject(new Error('Unexpected execa call'));
    });

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].failed[0]).toMatchObject({
      name: 'MyAppTests.testFailure',
      status: 'Failure',
      duration: 0.456,
    });
    // Should not have failureMessage when details can't be fetched
    expect(result.suites[0].failed[0].failureMessage).toBeUndefined();
  });

  it('should handle empty test summaries', async () => {
    mockGetSummary.mockResolvedValue({
      issues: {
        testableSummaries: {
          _values: [],
        },
      },
    });

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result).toMatchObject<Report>({
      totalSuites: 0,
      totalTests: 0,
      totalDuration: 0,
      suites: [],
    });
  });

  it('should handle alternative data structure (actions path)', async () => {
    mockGetSummary.mockResolvedValue({
      actions: {
        _values: [{
          actionResult: {
            testsRef: {
              id: {
                _value: []
              }
            }
          }
        }]
      }
    });

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result).toMatchObject<Report>({
      totalSuites: 0,
      totalTests: 0,
      totalDuration: 0,
      suites: [],
    });
  });

  it('should handle tests with subtests', async () => {
    const fixtureWithSubtests = {
      issues: {
        testableSummaries: {
          _values: [
            {
              name: {
                _value: "TestSuiteWithSubtests"
              },
              tests: {
                _values: [
                  {
                    identifier: {
                      _value: "ParentTest"
                    },
                    subtests: {
                      _values: [
                        {
                          identifier: {
                            _value: "SubTest1"
                          },
                          testStatus: {
                            _value: "Success"
                          },
                          duration: {
                            _value: 0.1
                          }
                        },
                        {
                          identifier: {
                            _value: "SubTest2"
                          },
                          testStatus: {
                            _value: "Failure"
                          },
                          duration: {
                            _value: 0.2
                          },
                          summaryRef: {
                            id: {
                              _value: "subtest-failure-id"
                            }
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    };

    mockGetSummary.mockResolvedValue(fixtureWithSubtests);
    mockGetTestDetails.mockResolvedValue({
      summaries: {
        _values: [{
          message: {
            _value: "Subtest assertion failed"
          }
        }]
      },
      location: {
        _value: {
          fileName: {
            _value: "/path/to/SubTests.swift"
          },
          lineNumber: {
            _value: 25
          }
        }
      }
    });

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalSuites).toBe(1);
    expect(result.totalTests).toBe(2);
    expect(result.suites[0].suiteName).toBe('TestSuiteWithSubtests');
    expect(result.suites[0].passed).toHaveLength(1);
    expect(result.suites[0].failed).toHaveLength(1);
    expect(result.suites[0].failed[0].name).toBe('SubTest2');
    expect(result.suites[0].failed[0].failureMessage).toBe('Subtest assertion failed');
  });

  it('should handle tests with children instead of subtests', async () => {
    const fixtureWithChildren = {
      issues: {
        testableSummaries: {
          _values: [
            {
              name: {
                _value: "TestSuiteWithChildren"
              },
              tests: {
                _values: [
                  {
                    identifier: {
                      _value: "ParentTest"
                    },
                    children: {
                      _values: [
                        {
                          identifier: {
                            _value: "ChildTest1"
                          },
                          testStatus: {
                            _value: "Success"
                          },
                          duration: {
                            _value: 0.3
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    };

    mockGetSummary.mockResolvedValue(fixtureWithChildren);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalSuites).toBe(1);
    expect(result.totalTests).toBe(1);
    expect(result.suites[0].passed[0].name).toBe('ChildTest1');
  });

  it('should skip container nodes that have subtests or children', async () => {
    const fixtureWithContainers = {
      issues: {
        testableSummaries: {
          _values: [
            {
              name: {
                _value: "TestSuiteWithContainers"
              },
              tests: {
                _values: [
                  {
                    identifier: {
                      _value: "ContainerTest"
                    },
                    testStatus: {
                      _value: "Success"
                    },
                    duration: {
                      _value: 0.5
                    },
                    subtests: {
                      _values: [
                        {
                          identifier: {
                            _value: "ActualTest"
                          },
                          testStatus: {
                            _value: "Success"
                          },
                          duration: {
                            _value: 0.5
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    };

    mockGetSummary.mockResolvedValue(fixtureWithContainers);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.totalTests).toBe(1);
    expect(result.suites[0].passed[0].name).toBe('ActualTest');
    // Container test should not be included
    expect(result.suites[0].passed.find(t => t.name === 'ContainerTest')).toBeUndefined();
  });

  it('should handle unknown test status (not included in results)', async () => {
    const fixtureWithUnknownStatus = {
      issues: {
        testableSummaries: {
          _values: [
            {
              name: {
                _value: "TestSuiteWithUnknown"
              },
              tests: {
                _values: [
                  {
                    identifier: {
                      _value: "UnknownStatusTest"
                    },
                    duration: {
                      _value: 0.1
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    };

    mockGetSummary.mockResolvedValue(fixtureWithUnknownStatus);

    const result = await parseXCResult('/path/to/test.xcresult');

    // Unknown status tests are not included in passed or failed arrays
    expect(result.totalTests).toBe(0);
    expect(result.suites[0].passed).toHaveLength(0);
    expect(result.suites[0].failed).toHaveLength(0);
  });

  it('should handle failure with testFailureSummaries instead of summaries', async () => {
    const customFixture = {
      issues: {
        testableSummaries: {
          _values: [{
            name: { _value: 'MyAppTests' },
            tests: {
              _values: [{
                identifier: { _value: 'MyAppTests.testFailure' },
                testStatus: { _value: 'Failure' },
                duration: { _value: 0.456 },
                summaryRef: {
                  id: { _value: 'testfailuresummaries-id' }
                }
              }]
            }
          }]
        }
      }
    };
    
    mockGetSummary.mockResolvedValue(customFixture);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].failed[0].failureMessage).toBe('Test failure from testFailureSummaries');
    // File and line information removed from output format
  });

  it('should handle failure with producingTarget fallback message', async () => {
    const customFixture = {
      issues: {
        testableSummaries: {
          _values: [{
            name: { _value: 'MyAppTests' },
            tests: {
              _values: [{
                identifier: { _value: 'MyAppTests.testFailure' },
                testStatus: { _value: 'Failure' },
                duration: { _value: 0.456 },
                summaryRef: {
                  id: { _value: 'target-failure-id' }
                }
              }]
            }
          }]
        }
      }
    };
    
    mockGetSummary.mockResolvedValue(customFixture);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].failed[0].failureMessage).toBe('Target failure message');
  });

  it('should handle failure with no specific message', async () => {
    const customFixture = {
      issues: {
        testableSummaries: {
          _values: [{
            name: { _value: 'MyAppTests' },
            tests: {
              _values: [{
                identifier: { _value: 'MyAppTests.testFailure' },
                testStatus: { _value: 'Failure' },
                duration: { _value: 0.456 },
                summaryRef: {
                  id: { _value: 'no-message-id' }
                }
              }]
            }
          }]
        }
      }
    };
    
    mockGetSummary.mockResolvedValue(customFixture);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].failed[0].failureMessage).toBe('Test failed');
  });

  it('should handle missing suite name', async () => {
    const fixtureWithoutName = {
      issues: {
        testableSummaries: {
          _values: [
            {
              tests: {
                _values: [
                  {
                    identifier: {
                      _value: "TestWithoutSuiteName"
                    },
                    testStatus: {
                      _value: "Success"
                    },
                    duration: {
                      _value: 0.1
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    };

    mockGetSummary.mockResolvedValue(fixtureWithoutName);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].suiteName).toBe('Unknown Suite');
  });

  it('should handle missing test name', async () => {
    const fixtureWithoutTestName = {
      issues: {
        testableSummaries: {
          _values: [
            {
              name: {
                _value: "TestSuite"
              },
              tests: {
                _values: [
                  {
                    testStatus: {
                      _value: "Success"
                    },
                    duration: {
                      _value: 0.1
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    };

    mockGetSummary.mockResolvedValue(fixtureWithoutTestName);

    const result = await parseXCResult('/path/to/test.xcresult');

    expect(result.suites[0].passed[0].name).toBe('Unknown Test');
  });
});