/**
 * Contract tests for format parsers
 * Ensures all format parsers implement the same behavioral contracts
 */

import { FormatParser } from '../../src/core/interfaces.js';
import { Xcode16FormatParser } from '../../src/formats/xcode16-format-parser.js';
import { Xcode15FormatParser } from '../../src/formats/xcode15-format-parser.js';
import { LegacyFormatParser } from '../../src/formats/legacy-format-parser.js';

// Mock execa for Xcode16FormatParser
jest.mock('execa', () => ({
  execa: jest.fn(() => Promise.resolve({
    stdout: JSON.stringify({ testNodes: [] })
  }))
}));

// Contract test suite that all parsers must pass
function testParserContract(ParserClass: new () => FormatParser, parserName: string) {
  describe(`${parserName} Contract Tests`, () => {
    let parser: FormatParser;
    
    beforeEach(() => {
      parser = new ParserClass();
    });

    describe('Basic Properties', () => {
      it('should have a name property', () => {
        expect(parser.name).toBeDefined();
        expect(typeof parser.name).toBe('string');
        expect(parser.name.length).toBeGreaterThan(0);
      });

      it('should have a priority property', () => {
        expect(parser.priority).toBeDefined();
        expect(typeof parser.priority).toBe('number');
        expect(parser.priority).toBeGreaterThan(0);
      });

      it('should have unique name across parsers', () => {
        const allParsers = [
          new Xcode16FormatParser(),
          new Xcode15FormatParser(), 
          new LegacyFormatParser()
        ];
        
        const names = allParsers.map(p => p.name);
        const uniqueNames = new Set(names);
        
        expect(uniqueNames.size).toBe(allParsers.length);
      });
    });

    describe('canParse Method', () => {
      it('should accept any data and return boolean', () => {
        expect(typeof parser.canParse({})).toBe('boolean');
        expect(typeof parser.canParse(null)).toBe('boolean');
        expect(typeof parser.canParse(undefined)).toBe('boolean');
        expect(typeof parser.canParse([])).toBe('boolean');
        expect(typeof parser.canParse('string')).toBe('boolean');
        expect(typeof parser.canParse(123)).toBe('boolean');
      });

      it('should not throw errors for invalid data', () => {
        expect(() => parser.canParse(null)).not.toThrow();
        expect(() => parser.canParse(undefined)).not.toThrow();
        expect(() => parser.canParse({})).not.toThrow();
        expect(() => parser.canParse([])).not.toThrow();
        expect(() => parser.canParse('invalid')).not.toThrow();
        expect(() => parser.canParse(123)).not.toThrow();
        expect(() => parser.canParse({ random: 'data' })).not.toThrow();
      });

      it('should be deterministic', () => {
        const testData = { test: 'data' };
        const result1 = parser.canParse(testData);
        const result2 = parser.canParse(testData);
        
        expect(result1).toBe(result2);
      });
    });

    describe('parse Method', () => {
      it('should return a Promise', () => {
        const result = parser.parse('/test/path', {});
        expect(result).toBeInstanceOf(Promise);
      });

      it('should handle invalid data gracefully when canParse returns false', async () => {
        // Parsers don't necessarily reject for invalid data - they may return empty results
        if (!parser.canParse({})) {
          const result = await parser.parse('/test/path', {});
          expect(result).toMatchObject({
            totalSuites: expect.any(Number),
            totalTests: expect.any(Number),
            totalDuration: expect.any(Number),
            suites: expect.any(Array)
          });
        }
      });

      it('should return valid Report structure when successful', async () => {
        // Create minimal valid data that the parser accepts
        const validData = createValidDataForParser(parser);
        
        if (validData && parser.canParse(validData)) {
          const result = await parser.parse('/test/path', validData);
          
          expect(result).toMatchObject({
            totalSuites: expect.any(Number),
            totalTests: expect.any(Number), 
            totalDuration: expect.any(Number),
            suites: expect.any(Array)
          });
          
          // Verify numeric constraints
          expect(result.totalSuites).toBeGreaterThanOrEqual(0);
          expect(result.totalTests).toBeGreaterThanOrEqual(0);
          expect(result.totalDuration).toBeGreaterThanOrEqual(0);
          
          // Verify suite structure
          result.suites.forEach(suite => {
            expect(suite).toMatchObject({
              suiteName: expect.any(String),
              duration: expect.any(Number),
              failed: expect.any(Array),
              passed: expect.any(Array)
            });
            
            expect(suite.duration).toBeGreaterThanOrEqual(0);
            
            // Verify test case structure
            [...suite.failed, ...suite.passed].forEach(test => {
              expect(test).toMatchObject({
                name: expect.any(String),
                status: expect.stringMatching(/^(Success|Failure|Skipped)$/),
                duration: expect.any(Number)
              });
              
              expect(test.duration).toBeGreaterThanOrEqual(0);
              
              // Failed tests should have failure message
              if (test.status === 'Failure') {
                expect(test).toHaveProperty('failureMessage');
                expect(typeof test.failureMessage).toBe('string');
              }
            });
          });
        }
      });

      it('should handle empty or minimal valid data gracefully', async () => {
        const minimalData = createMinimalValidDataForParser(parser);
        
        if (minimalData && parser.canParse(minimalData)) {
          const result = await parser.parse('/test/path', minimalData);
          
          // Should return valid structure even for minimal data
          expect(result).toMatchObject({
            totalSuites: expect.any(Number),
            totalTests: expect.any(Number),
            totalDuration: expect.any(Number),
            suites: expect.any(Array)
          });
          
          // Values can be zero for empty results
          expect(result.totalSuites).toBeGreaterThanOrEqual(0);
          expect(result.totalTests).toBeGreaterThanOrEqual(0);
          expect(result.totalDuration).toBeGreaterThanOrEqual(0);
        }
      });
    });

    describe('Data Consistency', () => {
      it('should maintain basic consistency between total counts and suite contents', async () => {
        const validData = createValidDataForParser(parser);
        
        if (validData && parser.canParse(validData)) {
          const result = await parser.parse('/test/path', validData);
          
          // Calculate totals from suites
          const calculatedSuites = result.suites.length;
          const calculatedTests = result.suites.reduce((total, suite) => 
            total + suite.failed.length + suite.passed.length, 0
          );
          
          // Suite count should always match
          expect(result.totalSuites).toBe(calculatedSuites);
          
          // For parsers that can calculate test counts from suites
          if (calculatedTests > 0) {
            expect(result.totalTests).toBe(calculatedTests);
          }
          
          // Duration may be calculated differently (action vs test level)
          // Just ensure it's non-negative
          expect(result.totalDuration).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });
}

// Helper functions to create test data for different parsers
function createValidDataForParser(parser: FormatParser): any | null {
  switch (parser.name) {
    case 'xcode16':
      return {
        devicesAndConfigurations: [],
        passedTests: 5,
        failedTests: 2,
        skippedTests: 1,
        startTime: 1000,
        finishTime: 2000,
        testFailures: [],
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
                nodeIdentifier: 'test1'
              }
            ]
          }
        ]
      };
      
    case 'xcode15':
      return {
        actions: {
          _values: [
            {
              startedTime: { _value: '2024-01-01T10:00:00Z' },
              endedTime: { _value: '2024-01-01T10:01:00Z' },
              actionResult: {
                testsRef: {
                  id: { _value: 'test-summary-id' }
                }
              }
            }
          ]
        }
      };
      
    case 'legacy':
      return {
        issues: {
          testableSummaries: {
            _values: [
              {
                name: { _value: 'TestSuite' },
                tests: {
                  _values: [
                    {
                      identifier: { _value: 'testExample' },
                      testStatus: { _value: 'Success' },
                      duration: { _value: 0.1 }
                    }
                  ]
                }
              }
            ]
          }
        }
      };
      
    default:
      return null;
  }
}

function createMinimalValidDataForParser(parser: FormatParser): any | null {
  switch (parser.name) {
    case 'xcode16':
      return {
        devicesAndConfigurations: [],
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        testFailures: [],
        testNodes: []
      };
      
    case 'xcode15':
      return {
        actions: { _values: [] }
      };
      
    case 'legacy':
      return {
        issues: {
          testableSummaries: { _values: [] }
        }
      };
      
    default:
      return null;
  }
}

// Run contract tests for all parsers
describe('Format Parser Contracts', () => {
  testParserContract(Xcode16FormatParser, 'Xcode16FormatParser');
  testParserContract(Xcode15FormatParser, 'Xcode15FormatParser');
  testParserContract(LegacyFormatParser, 'LegacyFormatParser');

  describe('Cross-Parser Validation', () => {
    it('should have different priorities for proper ordering', () => {
      const parsers = [
        new Xcode16FormatParser(),
        new Xcode15FormatParser(),
        new LegacyFormatParser()
      ];
      
      const priorities = parsers.map(p => p.priority);
      const uniquePriorities = new Set(priorities);
      
      expect(uniquePriorities.size).toBe(parsers.length);
    });

    it('should have Xcode16 parser with highest priority', () => {
      const xcode16 = new Xcode16FormatParser();
      const xcode15 = new Xcode15FormatParser();
      const legacy = new LegacyFormatParser();
      
      expect(xcode16.priority).toBeGreaterThan(xcode15.priority);
      expect(xcode16.priority).toBeGreaterThan(legacy.priority);
    });

    it('should not have overlapping format detection', () => {
      const parsers = [
        new Xcode16FormatParser(),
        new Xcode15FormatParser(),
        new LegacyFormatParser()
      ];
      
      // Test with each parser's preferred format
      parsers.forEach(parser => {
        const validData = createValidDataForParser(parser);
        if (validData) {
          const acceptingParsers = parsers.filter(p => p.canParse(validData));
          
          // Only the intended parser should accept its specific format
          expect(acceptingParsers).toHaveLength(1);
          expect(acceptingParsers[0].name).toBe(parser.name);
        }
      });
    });
  });
});