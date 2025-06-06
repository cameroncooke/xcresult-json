/**
 * Unit tests for the public API
 * Tests the main entry point that external users depend on
 */

import { parseXCResult, XCResultError } from '../../src/api.js';
import { XCResultDataSource } from '../../src/core/interfaces.js';

// Mock the data source to test business logic in isolation
class MockDataSource implements XCResultDataSource {
  constructor(private mockData: any) {}
  
  async getData(bundlePath: string): Promise<any> {
    if (bundlePath === '/invalid/path') {
      throw new Error('Bundle not found');
    }
    return this.mockData;
  }
}

// Mock the infrastructure layer
jest.mock('../../src/infrastructure/xcresulttool-data-source.js', () => ({
  XCResultToolDataSource: jest.fn().mockImplementation(() => new MockDataSource({}))
}));

describe('Public API', () => {
  describe('parseXCResult', () => {
    it('should return structured report for valid input', async () => {
      // Mock a successful data source
      const mockData = {
        issues: {
          testableSummaries: {
            _values: [{
              name: { _value: 'TestSuite' },
              tests: {
                _values: [{
                  identifier: { _value: 'testExample' },
                  testStatus: { _value: 'Success' },
                  duration: { _value: 0.1 }
                }]
              }
            }]
          }
        }
      };

      const { XCResultToolDataSource } = await import('../../src/infrastructure/xcresulttool-data-source.js');
      (XCResultToolDataSource as jest.Mock).mockImplementation(() => new MockDataSource(mockData));

      const result = await parseXCResult('/path/to/test.xcresult');

      expect(result).toMatchObject({
        totalSuites: expect.any(Number),
        totalTests: expect.any(Number),
        totalDuration: expect.any(Number),
        suites: expect.arrayContaining([
          expect.objectContaining({
            suiteName: expect.any(String),
            duration: expect.any(Number),
            failed: expect.any(Array),
            passed: expect.any(Array)
          })
        ])
      });
    });

    it('should handle parse options correctly', async () => {
      // Use valid legacy format data
      const mockData = {
        issues: {
          testableSummaries: {
            _values: []
          }
        }
      };
      const { XCResultToolDataSource } = await import('../../src/infrastructure/xcresulttool-data-source.js');
      
      let capturedOptions: any;
      (XCResultToolDataSource as jest.Mock).mockImplementation((options) => {
        capturedOptions = options;
        return new MockDataSource(mockData);
      });

      await parseXCResult('/path/to/test.xcresult', {
        cache: false,
        validate: true
      });

      expect(capturedOptions).toEqual({
        cache: false,
        validate: true
      });
    });

    it('should use default options when none provided', async () => {
      // Use valid legacy format data
      const mockData = {
        issues: {
          testableSummaries: {
            _values: []
          }
        }
      };
      const { XCResultToolDataSource } = await import('../../src/infrastructure/xcresulttool-data-source.js');
      
      let capturedOptions: any;
      (XCResultToolDataSource as jest.Mock).mockImplementation((options) => {
        capturedOptions = options;
        return new MockDataSource(mockData);
      });

      await parseXCResult('/path/to/test.xcresult');

      expect(capturedOptions).toEqual({
        cache: true,
        validate: false
      });
    });

    it('should throw XCResultError for invalid bundles', async () => {
      const { XCResultToolDataSource } = await import('../../src/infrastructure/xcresulttool-data-source.js');
      (XCResultToolDataSource as jest.Mock).mockImplementation(() => ({
        getData: async () => {
          throw XCResultError.invalidBundle('/invalid/path');
        }
      }));

      await expect(parseXCResult('/invalid/path')).rejects.toThrow(XCResultError);
      await expect(parseXCResult('/invalid/path')).rejects.toThrow('Invalid xcresult bundle');
    });

    it('should throw XCResultError when no parser can handle the format', async () => {
      const unknownFormatData = { unknownFormat: true };
      const { XCResultToolDataSource } = await import('../../src/infrastructure/xcresulttool-data-source.js');
      (XCResultToolDataSource as jest.Mock).mockImplementation(() => new MockDataSource(unknownFormatData));

      await expect(parseXCResult('/unknown/format.xcresult')).rejects.toThrow(XCResultError);
      await expect(parseXCResult('/unknown/format.xcresult')).rejects.toThrow('Unsupported xcresult format');
    });
  });
});