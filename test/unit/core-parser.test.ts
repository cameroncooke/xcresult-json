/**
 * Unit tests for core parser business logic
 * Tests the orchestration and format detection without infrastructure dependencies
 */

import { XCResultParser } from '../../src/core/parser.js';
import { XCResultDataSource, FormatParser } from '../../src/core/interfaces.js';
import { XCResultError } from '../../src/core/errors.js';
import { Report } from '../../src/types/report.js';

// Mock data source for testing
class MockDataSource implements XCResultDataSource {
  constructor(private mockData: any) {}
  
  async getData(bundlePath: string): Promise<any> {
    if (bundlePath === '/error/path') {
      throw new Error('Data source error');
    }
    return this.mockData;
  }
}

// Mock format parsers for testing
class MockFormatParser implements FormatParser {
  constructor(
    public readonly name: string,
    public readonly priority: number,
    private canParseResult: boolean = true,
    private parseResult: Report | null = null
  ) {}

  canParse(_data: any): boolean {
    return this.canParseResult;
  }

  async parse(_bundlePath: string, _data: any): Promise<Report> {
    if (this.parseResult) {
      return this.parseResult;
    }
    
    return {
      totalSuites: 1,
      totalTests: 1,
      totalDuration: 0.1,
      suites: [{
        suiteName: 'MockSuite',
        duration: 0.1,
        failed: [],
        passed: [{
          name: 'mockTest',
          status: 'Success' as const,
          duration: 0.1
        }]
      }]
    };
  }
}

describe('XCResultParser', () => {
  let parser: XCResultParser;
  let mockDataSource: MockDataSource;

  beforeEach(() => {
    mockDataSource = new MockDataSource({ mockData: true });
    parser = new XCResultParser(mockDataSource);
  });

  describe('Parser Registration', () => {
    it('should register parsers and sort by priority', () => {
      const parser1 = new MockFormatParser('parser1', 90);
      const parser2 = new MockFormatParser('parser2', 100);
      const parser3 = new MockFormatParser('parser3', 80);

      parser.registerParser(parser1);
      parser.registerParser(parser2);
      parser.registerParser(parser3);

      const parsers = parser.getParsers();
      expect(parsers).toHaveLength(3);
      expect(parsers[0].name).toBe('parser2'); // Highest priority
      expect(parsers[1].name).toBe('parser1');
      expect(parsers[2].name).toBe('parser3'); // Lowest priority
    });
  });

  describe('Format Detection', () => {
    it('should try parsers in priority order', async () => {
      const tryOrder: string[] = [];
      
      class TrackingParser extends MockFormatParser {
        canParse(_data: any): boolean {
          tryOrder.push(this.name);
          return false; // Reject to test ordering
        }
      }

      parser.registerParser(new TrackingParser('low', 80));
      parser.registerParser(new TrackingParser('high', 100));
      parser.registerParser(new TrackingParser('medium', 90));

      try {
        await parser.parse('/test/path');
      } catch (error) {
        // Expected to fail since all parsers reject
      }

      expect(tryOrder).toEqual(['high', 'medium', 'low']);
    });

    it('should use first parser that accepts the format', async () => {
      const parser1 = new MockFormatParser('parser1', 100, false); // Rejects
      const parser2 = new MockFormatParser('parser2', 90, true);   // Accepts
      const parser3 = new MockFormatParser('parser3', 80, true);   // Would accept but shouldn't be tried

      parser.registerParser(parser1);
      parser.registerParser(parser2);
      parser.registerParser(parser3);

      const result = await parser.parse('/test/path');
      
      expect(result).toBeDefined();
      expect(result.suites[0].suiteName).toBe('MockSuite');
    });

    it('should continue to next parser if current one fails', async () => {
      class FailingParser extends MockFormatParser {
        async parse(): Promise<Report> {
          throw new Error('Parser implementation failed');
        }
      }

      const failingParser = new FailingParser('failing', 100, true);
      const workingParser = new MockFormatParser('working', 90, true);

      parser.registerParser(failingParser);
      parser.registerParser(workingParser);

      // Should succeed using the working parser
      const result = await parser.parse('/test/path');
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw XCResultError for empty bundle path', async () => {
      await expect(parser.parse('')).rejects.toThrow(XCResultError);
      await expect(parser.parse('')).rejects.toThrow('Path is required');
    });

    it('should throw XCResultError when no parser can handle format', async () => {
      const rejectingParser = new MockFormatParser('rejecting', 100, false);
      parser.registerParser(rejectingParser);

      await expect(parser.parse('/test/path')).rejects.toThrow(XCResultError);
      await expect(parser.parse('/test/path')).rejects.toThrow('Unsupported xcresult format');
    });

    it('should wrap data source errors in XCResultError', async () => {
      const errorDataSource = new MockDataSource(null);
      const errorParser = new XCResultParser(errorDataSource);
      
      await expect(errorParser.parse('/error/path')).rejects.toThrow(XCResultError);
      await expect(errorParser.parse('/error/path')).rejects.toThrow('xcresulttool execution failed');
    });

    it('should preserve XCResultError from data source', async () => {
      const dataSource: XCResultDataSource = {
        async getData() {
          throw XCResultError.invalidBundle('/test/path');
        }
      };
      const errorParser = new XCResultParser(dataSource);

      await expect(errorParser.parse('/test/path')).rejects.toThrow(XCResultError);
      await expect(errorParser.parse('/test/path')).rejects.toThrow('Invalid xcresult bundle');
    });
  });

  describe('Business Logic', () => {
    it('should pass bundle path to data source', async () => {
      let capturedPath: string = '';
      const trackingDataSource: XCResultDataSource = {
        async getData(bundlePath: string) {
          capturedPath = bundlePath;
          return { mockData: true };
        }
      };

      const trackingParser = new XCResultParser(trackingDataSource);
      trackingParser.registerParser(new MockFormatParser('test', 100));

      await trackingParser.parse('/specific/path.xcresult');
      
      expect(capturedPath).toBe('/specific/path.xcresult');
    });

    it('should pass data and bundle path to format parser', async () => {
      const mockData = { specific: 'data' };
      const dataSource = new MockDataSource(mockData);
      const testParser = new XCResultParser(dataSource);

      let capturedData: any;
      let capturedPath: string = '';

      class TrackingFormatParser extends MockFormatParser {
        async parse(bundlePath: string, data: any): Promise<Report> {
          capturedData = data;
          capturedPath = bundlePath;
          return super.parse(bundlePath, data);
        }
      }

      testParser.registerParser(new TrackingFormatParser('tracking', 100));
      
      await testParser.parse('/test/bundle.xcresult');

      expect(capturedData).toEqual(mockData);
      expect(capturedPath).toBe('/test/bundle.xcresult');
    });
  });
});