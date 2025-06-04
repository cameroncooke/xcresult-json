import { initializeValidator, validate, validateAndLog } from '../src/validator';
import { getSchema, getSummary, getTestDetails, clearCache } from '../src/xcjson';
import { execa } from 'execa';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

// Mock chalk
jest.mock('chalk', () => ({
  default: {
    yellow: jest.fn((str: string) => str),
  }
}));

import * as schema from '../src/schema';
import chalk from 'chalk';

const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;
const mockExeca = execa as jest.Mock;
const mockChalkYellow = (chalk.yellow as any) as jest.Mock;

// Mock console
const mockConsole = {
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};

const originalConsole = { ...console };

beforeAll(() => {
  Object.assign(console, mockConsole);
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

describe('Coverage Targeted Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    clearCache();
  });

  describe('Validator Module - Hit uncovered lines', () => {
    it('should handle validator initialization error (line 21)', async () => {
      const error = new Error('Schema fetch error');
      mockGetLiveSchema.mockRejectedValueOnce(error);
      
      await initializeValidator();
      
      expect(mockChalkYellow).toHaveBeenCalledWith('Warning: Failed to initialize validator: Schema fetch error');
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should log warning and errors when validation fails (lines 35-37)', async () => {
      const testSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      // This will fail validation and trigger warning paths
      const result = validate({ invalidField: 123 });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(mockChalkYellow).toHaveBeenCalledWith('Warning: JSON payload does not match schema');
      expect(mockChalkYellow).toHaveBeenCalledWith('Validation errors:');
      expect(mockConsole.warn).toHaveBeenCalledTimes(2);
    });

    it('should handle validateAndLog with invalid data (lines 50-53)', async () => {
      const testSchema = {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const invalidData = { notAnId: 'wrong' };
      const result = validateAndLog(invalidData, 'test context');
      
      expect(result).toBe(invalidData);
      expect(mockChalkYellow).toHaveBeenCalledWith('Schema validation failed for test context');
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should not reinitialize when already initialized (line 15)', async () => {
      mockGetLiveSchema.mockResolvedValueOnce({ type: 'object' });
      
      await initializeValidator();
      await initializeValidator(); // Second call should return early
      
      expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
    });
  });

  describe('XCJson Module - Hit uncovered lines', () => {
    it('should handle capability check failure (line 31)', async () => {
      mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'XCRESULTTOOL_NOT_FOUND',
        exitCode: 1
      });
    });

    it('should handle JSON parsing error in getSchema (line 79)', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({
          stdout: 'Command output structure (JSON Schema):\n{invalid json'
        });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_PARSE_ERROR'
      });
    });

    it('should handle generic command error in getSchema (line 85)', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce({ message: 'Command failed', exitCode: 3 });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_FETCH_ERROR',
        exitCode: 3
      });
    });

    it('should handle JSON parsing error in getSummary (line 98)', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: 'not valid json' });
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'SUMMARY_FETCH_ERROR'
      });
    });

    it('should handle invalid bundle error (lines 109-113)', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce({
          exitCode: 1,
          stderr: 'Error: not a valid .xcresult bundle',
          message: 'Command failed'
        });
      
      await expect(getSummary('/invalid.xcresult')).rejects.toMatchObject({
        code: 'INVALID_BUNDLE',
        exitCode: 2
      });
    });

    it('should handle general error in getSummary with exitCode (line 118)', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce({
          message: 'Other error',
          exitCode: 5
        });
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'SUMMARY_FETCH_ERROR',
        exitCode: 5
      });
    });

    it('should handle generic capability error (line 126)', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Command not found'));
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'XCRESULTTOOL_NOT_FOUND',
        exitCode: 1
      });
    });

    it('should warn and return null on getTestDetails error (line 154)', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(new Error('Test not found'));
      
      const result = await getTestDetails('/test.xcresult', 'missing-id');
      
      expect(result).toBeNull();
      expect(mockChalkYellow).toHaveBeenCalledWith(
        'Warning: Failed to get test details for missing-id: Test not found'
      );
      expect(mockConsole.warn).toHaveBeenCalled();
    });
  });

  describe('Cache Module - Hit uncovered lines', () => {
    it('should handle cache eviction on overflow', async () => {
      // This will test line 25 in cache.ts when cache overflows
      const mockData1 = { test: 1 };
      const mockData2 = { test: 2 };
      const mockData3 = { test: 3 };
      const mockData4 = { test: 4 };
      
      // Fill cache beyond capacity (3 items)
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData1) })
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData2) })
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData3) })
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData4) });
      
      await getSummary('/test1.xcresult');
      await getSummary('/test2.xcresult');
      await getSummary('/test3.xcresult');
      await getSummary('/test4.xcresult'); // This should evict first item
      
      expect(mockExeca).toHaveBeenCalledTimes(8); // 4 capability + 4 data calls
    });
  });

  describe('Parser Module - Hit uncovered branches', () => {
    it('should handle testable summaries with no testableSummaries', async () => {
      const summaryWithoutTestables = {
        actions: {
          _values: [{
            actionResult: {
              testsRef: null // No tests
            }
          }]
        }
      };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(summaryWithoutTestables) });
      
      const { parseXCResult } = await import('../src/parser');
      
      const result = await parseXCResult('/test.xcresult');
      expect(result.suites).toEqual([]);
    });
  });
});