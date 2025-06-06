import { ParserRegistry } from '../src/formats/registry';
import { Xcode16Parser } from '../src/formats/xcode16-parser';
import { Xcode15Parser } from '../src/formats/xcode15-parser';
import { LegacyParser } from '../src/formats/legacy-parser';
import { FormatParser } from '../src/formats/types';
import simpleTestFixture from './fixtures/simple-test.json';

describe('Format Parser System', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('ParserRegistry', () => {
    it('should register parsers in priority order', () => {
      const parser1: FormatParser = { name: 'test1', priority: 90, canParse: () => true, parse: async () => ({} as any) };
      const parser2: FormatParser = { name: 'test2', priority: 100, canParse: () => true, parse: async () => ({} as any) };
      
      registry.register(parser1);
      registry.register(parser2);
      
      const parsers = registry.getParsers();
      expect(parsers).toHaveLength(2);
      expect(parsers[0].name).toBe('test2'); // Higher priority first
      expect(parsers[1].name).toBe('test1');
    });

    it('should try parsers in priority order and return first successful result', async () => {
      const failingParser: FormatParser = {
        name: 'failing',
        priority: 100,
        canParse: () => true,
        parse: async () => { throw new Error('Parse failed'); }
      };
      
      const successParser: FormatParser = {
        name: 'success',
        priority: 90,
        canParse: () => true,
        parse: async () => ({ totalSuites: 1, totalTests: 1, totalDuration: 1, suites: [] })
      };
      
      registry.register(failingParser);
      registry.register(successParser);
      
      const result = await registry.parse('/test', {});
      expect(result.totalSuites).toBe(1);
    });

    it('should throw error when no parser can handle the data', async () => {
      const parser: FormatParser = {
        name: 'test',
        priority: 100,
        canParse: () => false,
        parse: async () => ({} as any)
      };
      
      registry.register(parser);
      
      await expect(registry.parse('/test', {})).rejects.toThrow(
        'No parser could handle the xcresult format'
      );
    });
  });

  describe('LegacyParser', () => {
    let parser: LegacyParser;

    beforeEach(() => {
      parser = new LegacyParser();
    });

    it('should identify legacy format data', () => {
      expect(parser.canParse(simpleTestFixture)).toBe(true);
      expect(parser.canParse({ testNodes: [] })).toBe(false);
      expect(parser.canParse({ actions: { _values: [] } })).toBe(false);
      expect(parser.canParse({})).toBe(false);
      expect(parser.canParse(null)).toBe(false);
    });

    it('should parse legacy format data correctly', async () => {
      const result = await parser.parse('/test', simpleTestFixture);
      
      expect(result.totalSuites).toBe(1);
      expect(result.totalTests).toBe(2);
      expect(result.totalDuration).toBe(0.579);
      expect(result.suites).toHaveLength(1);
      expect(result.suites[0].suiteName).toBe('MyAppTests');
      expect(result.suites[0].passed).toHaveLength(1);
      expect(result.suites[0].failed).toHaveLength(1);
    });
  });

  describe('Xcode16Parser', () => {
    let parser: Xcode16Parser;

    beforeEach(() => {
      parser = new Xcode16Parser();
    });

    it('should identify Xcode 16 format data', () => {
      const xcode16Data = { testNodes: [{ nodeType: 'Test Suite' }] };
      expect(parser.canParse(xcode16Data)).toBe(true);
      expect(parser.canParse(simpleTestFixture)).toBe(false);
      expect(parser.canParse({ actions: { _values: [] } })).toBe(false);
      expect(parser.canParse({})).toBe(false);
      expect(parser.canParse(null)).toBe(false);
    });

    it('should parse Xcode 16 format data correctly', async () => {
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
              {
                nodeType: 'Test Case',
                name: 'testFailure',
                result: 'Failed',
                durationInSeconds: 0.2,
              },
            ],
          },
        ],
      };

      const result = await parser.parse('/test', xcode16Data);
      
      expect(result.totalSuites).toBe(1);
      expect(result.totalTests).toBe(2);
      expect(result.totalDuration).toBeCloseTo(0.3, 1);
      expect(result.suites).toHaveLength(1);
      expect(result.suites[0].suiteName).toBe('TestSuite');
      expect(result.suites[0].passed).toHaveLength(1);
      expect(result.suites[0].failed).toHaveLength(1);
    });
  });

  describe('Xcode15Parser', () => {
    let parser: Xcode15Parser;

    beforeEach(() => {
      parser = new Xcode15Parser();
    });

    it('should identify Xcode 15 format data', () => {
      const xcode15Data = { actions: { _values: [{ startedTime: { _value: '2024-01-01' } }] } };
      expect(parser.canParse(xcode15Data)).toBe(true);
      expect(parser.canParse(simpleTestFixture)).toBe(false);
      expect(parser.canParse({ testNodes: [] })).toBe(false);
      expect(parser.canParse({})).toBe(false);
      expect(parser.canParse(null)).toBe(false);
    });

    it('should parse Xcode 15 format with timing data', async () => {
      const xcode15Data = {
        actions: {
          _values: [
            {
              startedTime: { _value: '2024-01-01T10:00:00.000Z' },
              endedTime: { _value: '2024-01-01T10:00:02.000Z' },
              actionResult: {},
            },
          ],
        },
      };

      const result = await parser.parse('/test', xcode15Data);
      
      expect(result.totalSuites).toBe(0);
      expect(result.totalTests).toBe(0);
      expect(result.totalDuration).toBe(2); // 2 seconds
      expect(result.suites).toEqual([]);
    });
  });

  describe('Format Detection Priority', () => {
    it('should try parsers in correct priority order', () => {
      registry.register(new LegacyParser());     // Priority 80
      registry.register(new Xcode15Parser());   // Priority 90  
      registry.register(new Xcode16Parser());   // Priority 100

      const parsers = registry.getParsers();
      expect(parsers).toHaveLength(3);
      expect(parsers[0].name).toBe('xcode16');   // Highest priority
      expect(parsers[1].name).toBe('xcode15');   // Second priority
      expect(parsers[2].name).toBe('legacy');    // Lowest priority
    });

    it('should use correct parser for each format', async () => {
      registry.register(new LegacyParser());
      registry.register(new Xcode15Parser());
      registry.register(new Xcode16Parser());

      // Test legacy format
      const legacyResult = await registry.parse('/test', simpleTestFixture);
      expect(legacyResult.totalSuites).toBe(1);

      // Test Xcode 16 format
      const xcode16Data = { testNodes: [{ nodeType: 'Test Suite', name: 'Test', children: [] }] };
      const xcode16Result = await registry.parse('/test', xcode16Data);
      expect(xcode16Result.totalSuites).toBe(1);

      // Test Xcode 15 format
      const xcode15Data = { actions: { _values: [{ startedTime: { _value: '2024-01-01T10:00:00.000Z' }, endedTime: { _value: '2024-01-01T10:00:01.000Z' }, actionResult: {} }] } };
      const xcode15Result = await registry.parse('/test', xcode15Data);
      expect(xcode15Result.totalDuration).toBe(1);
    });
  });
});