import { initializeValidator, validate, validateAndLog } from '../src/validator';
import { getSchema, getSummary, getTestDetails, XcjsonError, clearCache } from '../src/xcjson';
import { execa } from 'execa';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

import * as schema from '../src/schema';
const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;
const mockExeca = execa as jest.Mock;

// Mock console
const originalConsole = { ...console };
const mockConsole = {
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};

beforeAll(() => {
  Object.assign(console, mockConsole);
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

describe('Comprehensive Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    clearCache();
    // Reset validator state
    (initializeValidator as any).__reset?.();
  });

  describe('Validator Module', () => {
    it('should validate without initialized validator', () => {
      const result = validate({ any: 'data' });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should initialize validator successfully', async () => {
      const testSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const validResult = validate({ name: 'test' });
      expect(validResult.valid).toBe(true);
    });

    it('should handle validator initialization failure', async () => {
      const error = new Error('Schema fetch failed');
      mockGetLiveSchema.mockRejectedValueOnce(error);
      
      await initializeValidator();
      
      expect(mockConsole.warn).toHaveBeenCalledWith('Warning: Failed to initialize validator: Schema fetch failed');
      
      // Should still work without validation
      const result = validate({ any: 'data' });
      expect(result.valid).toBe(true);
    });

    it('should not reinitialize when already initialized', async () => {
      mockGetLiveSchema.mockResolvedValueOnce({ type: 'object' });
      
      await initializeValidator();
      await initializeValidator(); // Should return early
      
      expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
    });

    it('should handle validation failure with warnings', async () => {
      const testSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const invalidResult = validate({ wrongField: 123 });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
      expect(mockConsole.warn).toHaveBeenCalledWith('Warning: JSON payload does not match schema');
    });

    it('should handle validateAndLog with invalid data', async () => {
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
      expect(mockConsole.warn).toHaveBeenCalledWith('Schema validation failed for test context');
    });

    it('should handle validateAndLog without initialized validator', () => {
      const data = { test: 'data' };
      const result = validateAndLog(data, 'context');
      
      expect(result).toBe(data);
      // No warnings expected when validator not initialized
    });
  });

  describe('XcJSON Module', () => {
    it('should create XcjsonError properly', () => {
      const error1 = new XcjsonError('test', 'TEST_CODE', 1);
      expect(error1.message).toBe('test');
      expect(error1.code).toBe('TEST_CODE');
      expect(error1.exitCode).toBe(1);
      expect(error1.name).toBe('XcjsonError');

      const error2 = new XcjsonError('test2', 'TEST_CODE2');
      expect(error2.exitCode).toBeUndefined();
    });

    it('should get schema with test-report support', async () => {
      const mockSchema = { type: 'object' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({
          stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
        });
      
      const result = await getSchema('tests');
      expect(result).toEqual(mockSchema);
    });

    it('should get schema with legacy support', async () => {
      const mockSchema = { type: 'object' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get commands get --help' })
        .mockResolvedValueOnce({
          stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
        });
      
      const result = await getSchema('tests');
      expect(result).toEqual(mockSchema);
    });

    it('should handle capability check failure', async () => {
      mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'XCRESULTTOOL_NOT_FOUND',
        exitCode: 1
      });
    });

    it('should handle schema not found', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: 'No schema marker here' });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_NOT_FOUND'
      });
    });

    it('should handle missing JSON start marker', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({
          stdout: 'Command output structure (JSON Schema):\nNo opening brace'
        });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_PARSE_ERROR'
      });
    });

    it('should handle JSON parse error in schema', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({
          stdout: 'Command output structure (JSON Schema):\n{invalid'
        });
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_PARSE_ERROR'
      });
    });

    it('should handle schema fetch command error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(new Error('Command failed'));
      
      await expect(getSchema('tests')).rejects.toMatchObject({
        code: 'SCHEMA_FETCH_ERROR'
      });
    });

    it('should propagate existing XcjsonError', async () => {
      const existingError = new XcjsonError('existing', 'EXISTING');
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(existingError);
      
      await expect(getSchema('tests')).rejects.toThrow(existingError);
    });

    it('should get summary successfully', async () => {
      const mockData = { summary: true };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result = await getSummary('/test.xcresult');
      expect(result).toEqual(mockData);
    });

    it('should handle summary JSON parse error', async () => {
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
          stderr: 'not a valid .xcresult bundle',
          message: 'failed'
        });
      
      await expect(getSummary('/invalid.xcresult')).rejects.toMatchObject({
        code: 'INVALID_BUNDLE',
        exitCode: 2
      });
    });

    it('should handle xcresulttool not found in getSummary', async () => {
      mockExeca.mockRejectedValueOnce(new Error('not found'));
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'XCRESULTTOOL_NOT_FOUND',
        exitCode: 1
      });
    });

    it('should handle general summary error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce({ exitCode: 2, message: 'Other error' });
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 'SUMMARY_FETCH_ERROR',
        exitCode: 2
      });
    });

    it('should cache summary results', async () => {
      const mockData = { cached: true };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result1 = await getSummary('/test.xcresult');
      const result2 = await getSummary('/test.xcresult');
      
      expect(result1).toEqual(result2);
      expect(mockExeca).toHaveBeenCalledTimes(2); // capability + data
    });

    it('should get test details successfully', async () => {
      const mockDetails = { details: true };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result = await getTestDetails('/test.xcresult', 'test-id');
      expect(result).toEqual(mockDetails);
    });

    it('should handle test details error and warn', async () => {
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
      const mockDetails = { cached: true };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result1 = await getTestDetails('/test.xcresult', 'test-id');
      const result2 = await getTestDetails('/test.xcresult', 'test-id');
      
      expect(result1).toEqual(result2);
      expect(mockExeca).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches', async () => {
      const mock1 = { first: true };
      const mock2 = { second: true };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mock1) })
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mock2) });
      
      await getSummary('/test.xcresult');
      clearCache();
      
      const result = await getSummary('/test.xcresult');
      expect(result).toEqual(mock2);
      expect(mockExeca).toHaveBeenCalledTimes(4);
    });
  });
});