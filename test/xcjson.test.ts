import { getSchema, getSummary, getTestDetails, clearCache, XcjsonError } from '../src/xcjson';
import { execa } from 'execa';

const mockExeca = execa as jest.Mock;

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

describe('XcJSON Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    clearCache();
  });

  describe('XcjsonError', () => {
    it('should create error with message, code, and exitCode', () => {
      const error = new XcjsonError('Test error', 'TEST_CODE', 2);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.exitCode).toBe(2);
      expect(error.name).toBe('XcjsonError');
    });

    it('should create error without exitCode', () => {
      const error = new XcjsonError('Test error', 'TEST_CODE');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.exitCode).toBeUndefined();
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new XcjsonError('Test error', 'TEST_CODE');
      }).toThrow(XcjsonError);
    });
  });

  describe('getSchema', () => {
    it('should get schema with test-report support', async () => {
      const mockSchema = { type: 'object', properties: {} };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' }) // capability check
        .mockResolvedValueOnce({
          stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
        });
      
      const result = await getSchema('tests');
      expect(result).toEqual(mockSchema);
    });

    it('should get schema with legacy support', async () => {
      const mockSchema = { type: 'object', properties: {} };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get commands get --help' }) // no test-report
        .mockResolvedValueOnce({
          stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
        });
      
      const result = await getSchema('tests');
      expect(result).toEqual(mockSchema);
    });

    it('should handle missing schema marker', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: 'No schema marker here' });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_NOT_FOUND'
      });
    });

    it('should handle missing JSON start after marker', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({
          stdout: 'Command output structure (JSON Schema):\nNo opening brace here'
        });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_PARSE_ERROR'
      });
    });

    it('should handle malformed JSON', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({
          stdout: 'Command output structure (JSON Schema):\n{invalid json'
        });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_PARSE_ERROR'
      });
    });

    it('should handle capability check failure', async () => {
      mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'XCRESULTTOOL_NOT_FOUND',
        exitCode: 1
      });
    });

    it('should handle command failure after capability check', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(new Error('Help command failed'));
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_FETCH_ERROR'
      });
    });
  });

  describe('getSummary', () => {
    it('should get summary with test-report support', async () => {
      const mockData = { summary: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result = await getSummary('/test.xcresult');
      expect(result).toEqual(mockData);
    });

    it('should get summary with legacy support', async () => {
      const mockData = { legacy: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get commands get --help' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result = await getSummary('/test.xcresult');
      expect(result).toEqual(mockData);
    });

    it('should handle JSON parse error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: 'invalid json' });
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'SUMMARY_FETCH_ERROR'
      });
    });

    it('should handle invalid bundle error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce({
          exitCode: 1,
          stderr: 'Error: not a valid .xcresult bundle at path',
          message: 'Command failed'
        });
      
      await expect(getSummary('/invalid.xcresult')).rejects.toMatchObject({
        code: 'INVALID_BUNDLE',
        exitCode: 2
      });
    });

    it('should handle capability check error', async () => {
      mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'XCRESULTTOOL_NOT_FOUND',
        exitCode: 1
      });
    });

    it('should handle general command error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce({ exitCode: 2, message: 'Other error' });
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'SUMMARY_FETCH_ERROR',
        exitCode: 2
      });
    });

    it('should cache results', async () => {
      const mockData = { cached: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result1 = await getSummary('/test.xcresult');
      const result2 = await getSummary('/test.xcresult'); // Should use cache
      
      expect(result1).toEqual(result2);
      expect(mockExeca).toHaveBeenCalledTimes(2); // Only capability + data, no second data call
    });

    it('should handle cache overflow', async () => {
      const mockData1 = { test: 1 };
      const mockData2 = { test: 2 };
      const mockData3 = { test: 3 };
      const mockData4 = { test: 4 };
      
      // Only first call needs capability check, rest use cached result
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData1) })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData2) })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData3) })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData4) });
      
      await getSummary('/test1.xcresult');
      await getSummary('/test2.xcresult');
      await getSummary('/test3.xcresult');
      await getSummary('/test4.xcresult'); // This should evict first item
      
      expect(mockExeca).toHaveBeenCalledTimes(5); // 1 capability + 4 data calls
    });
  });

  describe('getTestDetails', () => {
    it('should get test details successfully', async () => {
      const mockDetails = { details: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result = await getTestDetails('/test.xcresult', 'test-id');
      expect(result).toEqual(mockDetails);
    });

    it('should use legacy command when needed', async () => {
      const mockDetails = { legacy: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get commands get --help' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result = await getTestDetails('/test.xcresult', 'test-id');
      expect(result).toEqual(mockDetails);
    });

    it('should return null and warn on error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(new Error('Test not found'));
      
      const result = await getTestDetails('/test.xcresult', 'missing-id');
      
      expect(result).toBeNull();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        'Warning: Failed to get test details for missing-id: Test not found'
      );
    });

    it('should cache test details', async () => {
      const mockDetails = { details: 'cached' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result1 = await getTestDetails('/test.xcresult', 'test-id');
      const result2 = await getTestDetails('/test.xcresult', 'test-id');
      
      expect(result1).toEqual(result2);
      expect(mockExeca).toHaveBeenCalledTimes(2); // Only capability + data
    });

    it('should handle JSON parse error and return null', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(new Error('Parse error'));
      
      const result = await getTestDetails('/test.xcresult', 'test-id');
      
      expect(result).toBeNull();
      expect(mockConsole.warn).toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    it('should clear cache without throwing', () => {
      expect(() => clearCache()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      clearCache();
      clearCache();
      expect(() => clearCache()).not.toThrow();
    });

    it('should clear all caches', async () => {
      const mockData = { test: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      await getSummary('/test.xcresult');
      clearCache();
      
      // After clearing cache, should make new calls
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      await getSummary('/test.xcresult');
      
      expect(mockExeca).toHaveBeenCalledTimes(4); // 2 capability + 2 data calls
    });
  });
});