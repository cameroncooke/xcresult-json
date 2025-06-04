// Final attempt at comprehensive working tests
import { initializeValidator, validate, validateAndLog } from '../src/validator';
import { getSchema, getSummary, getTestDetails, clearCache, XcjsonError } from '../src/xcjson';
import { execa } from 'execa';

// Override chalk mock specifically for this test
jest.doMock('chalk', () => ({
  __esModule: true,
  default: {
    yellow: jest.fn((str: string) => str),
    red: jest.fn((str: string) => str),
  },
}));

// Mock schema module
jest.doMock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

// Re-import after mocking
const schema = require('../src/schema');
const chalk = require('chalk');
const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;
const mockExeca = execa as jest.Mock;
const mockChalkYellow = chalk.default.yellow as jest.Mock;

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

describe('Final Working Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    clearCache();
  });

  describe('Validator Tests', () => {
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

    it('should handle initialization failure with warning', async () => {
      const error = new Error('Schema error');
      mockGetLiveSchema.mockRejectedValueOnce(error);
      
      await initializeValidator();
      
      expect(mockChalkYellow).toHaveBeenCalledWith(
        'Warning: Failed to initialize validator: Schema error'
      );
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should not reinitialize when already done', async () => {
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
      expect(mockChalkYellow).toHaveBeenCalledWith('Warning: JSON payload does not match schema');
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
      expect(mockChalkYellow).toHaveBeenCalledWith('Schema validation failed for test context');
    });
  });

  describe('XcJSON Tests', () => {
    it('should handle XcjsonError creation', () => {
      const error = new XcjsonError('test', 'TEST_CODE', 1);
      expect(error.message).toBe('test');
      expect(error.code).toBe('TEST_CODE');
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe('XcjsonError');
    });

    it('should get schema successfully', async () => {
      const mockSchema = { type: 'object' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
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

    it('should handle invalid bundle', async () => {
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

    it('should get test details and warn on error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'get test-report' })
        .mockRejectedValueOnce(new Error('Test not found'));
      
      const result = await getTestDetails('/test.xcresult', 'missing-id');
      expect(result).toBeNull();
      expect(mockChalkYellow).toHaveBeenCalledWith(
        'Warning: Failed to get test details for missing-id: Test not found'
      );
    });
  });
});