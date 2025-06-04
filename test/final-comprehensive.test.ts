import { initializeValidator, validate, validateAndLog } from '../src/validator';
import { getSchema, getSummary, getTestDetails, XcjsonError, clearCache } from '../src/xcjson';
import { execa } from 'execa';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

// Import after mocking
import * as schema from '../src/schema';
const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;
const mockExeca = execa as jest.Mock;

// Mock console to avoid test pollution
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

describe('Final Comprehensive Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    clearCache();
  });

  describe('Validator Module Complete Coverage', () => {
    it('should pass when no validator initialized', () => {
      const result = validate({ any: 'data' });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should initialize validator with schema', async () => {
      const testSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      // Test valid data
      expect(validate({ name: 'test' }).valid).toBe(true);
      
      // Test invalid data (triggers warning paths)
      const invalidResult = validate({ wrongField: 'test' });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
    });

    it('should handle validator initialization failure', async () => {
      mockGetLiveSchema.mockRejectedValueOnce(new Error('Schema error'));
      await initializeValidator();
      
      // Should log warning but still work
      expect(validate({ any: 'data' }).valid).toBe(true);
    });

    it('should not reinitialize when already done', async () => {
      mockGetLiveSchema.mockResolvedValueOnce({ type: 'object' });
      await initializeValidator();
      await initializeValidator(); // Second call
      
      expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
    });

    it('should validateAndLog with context - valid case', async () => {
      const testSchema = {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      // Valid data
      const validData = { id: 123 };
      expect(validateAndLog(validData, 'valid')).toBe(validData);
    });

    it('should validateAndLog with context - invalid case', async () => {
      const testSchema = {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      // Invalid data (triggers validation failure path)
      const invalidData = { notId: 'wrong' };
      expect(validateAndLog(invalidData, 'invalid context')).toBe(invalidData);
    });

    it('should work with uninitialized validator in validateAndLog', () => {
      const data = { test: 'data' };
      expect(validateAndLog(data, 'context')).toBe(data);
    });
  });

  describe('XCJson Module Complete Coverage', () => {
    describe('XcjsonError', () => {
      it('should create errors properly', () => {
        const error1 = new XcjsonError('msg', 'CODE');
        expect(error1.message).toBe('msg');
        expect(error1.code).toBe('CODE');
        expect(error1.exitCode).toBeUndefined();
        expect(error1.name).toBe('XcjsonError');
        
        const error2 = new XcjsonError('msg', 'CODE', 42);
        expect(error2.exitCode).toBe(42);
      });
    });

    describe('getSchema', () => {
      it('should get schema with test-report support', async () => {
        const mockSchema = { type: 'object' };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' }) // capability check
          .mockResolvedValueOnce({
            stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
          }); // schema fetch
        
        const result = await getSchema('tests');
        expect(result).toEqual(mockSchema);
      });

      it('should get schema with legacy support', async () => {
        const mockSchema = { type: 'object' };
        
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
        
        await expect(getSchema('tests')).rejects.toMatchObject({ code: 'SCHEMA_NOT_FOUND' });
      });

      it('should handle missing JSON after marker', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: 'Command output structure (JSON Schema):\nNo JSON start' });
        
        await expect(getSchema('tests')).rejects.toMatchObject({ code: 'SCHEMA_PARSE_ERROR' });
      });

      it('should handle malformed JSON', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: 'Command output structure (JSON Schema):\n{invalid' });
        
        await expect(getSchema('tests')).rejects.toMatchObject({ code: 'SCHEMA_PARSE_ERROR' });
      });

      it('should handle command failure', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockRejectedValueOnce(new Error('Command failed'));
        
        await expect(getSchema('tests')).rejects.toMatchObject({ code: 'SCHEMA_FETCH_ERROR' });
      });

      it('should propagate existing XcjsonError', async () => {
        const existingError = new XcjsonError('existing', 'EXISTING');
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockRejectedValueOnce(existingError);
        
        await expect(getSchema('tests')).rejects.toThrow(existingError);
      });

      it('should handle capability check failure', async () => {
        mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
        
        await expect(getSchema('tests')).rejects.toMatchObject({ 
          code: 'XCRESULTTOOL_NOT_FOUND' 
        });
      });
    });

    describe('getSummary', () => {
      it('should get summary successfully', async () => {
        const mockData = { summary: true };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
        
        const result = await getSummary('/test.xcresult');
        expect(result).toEqual(mockData);
      });

      it('should use legacy command when needed', async () => {
        const mockData = { legacy: true };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get commands get --help' }) // no test-report
          .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
        
        const result = await getSummary('/test.xcresult');
        expect(result).toEqual(mockData);
      });

      it('should handle invalid bundle error', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockRejectedValueOnce({
            exitCode: 1,
            stderr: 'not a valid .xcresult bundle',
            message: 'Failed'
          });
        
        await expect(getSummary('/invalid')).rejects.toMatchObject({
          code: 'INVALID_BUNDLE',
          exitCode: 2
        });
      });

      it('should handle xcresulttool not found', async () => {
        mockExeca.mockRejectedValueOnce(new Error('not found'));
        
        await expect(getSummary('/test')).rejects.toMatchObject({
          code: 'XCRESULTTOOL_NOT_FOUND',
          exitCode: 1
        });
      });

      it('should handle general error', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockRejectedValueOnce({ exitCode: 2, message: 'Other error' });
        
        await expect(getSummary('/test')).rejects.toMatchObject({
          code: 'SUMMARY_FETCH_ERROR',
          exitCode: 2
        });
      });

      it('should cache results', async () => {
        const mockData = { cached: true };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
        
        const result1 = await getSummary('/test.xcresult');
        const result2 = await getSummary('/test.xcresult'); // Should use cache
        
        expect(result1).toEqual(result2);
        expect(mockExeca).toHaveBeenCalledTimes(2); // Only capability + first call
      });

      it('should handle JSON parse error', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: 'invalid json' });
        
        await expect(getSummary('/test')).rejects.toMatchObject({
          code: 'SUMMARY_FETCH_ERROR'
        });
      });
    });

    describe('getTestDetails', () => {
      it('should get test details successfully', async () => {
        const mockDetails = { details: true };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
        
        const result = await getTestDetails('/test.xcresult', 'test-id');
        expect(result).toEqual(mockDetails);
      });

      it('should use legacy command', async () => {
        const mockDetails = { legacy: true };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get commands get --help' })
          .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
        
        const result = await getTestDetails('/test.xcresult', 'test-id');
        expect(result).toEqual(mockDetails);
      });

      it('should return null on error and warn', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockRejectedValueOnce(new Error('Test not found'));
        
        const result = await getTestDetails('/test.xcresult', 'missing-id');
        expect(result).toBeNull();
      });

      it('should cache test details', async () => {
        const mockDetails = { cached: true };
        
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
        
        const result1 = await getTestDetails('/test.xcresult', 'test-id');
        const result2 = await getTestDetails('/test.xcresult', 'test-id');
        
        expect(result1).toEqual(result2);
        expect(mockExeca).toHaveBeenCalledTimes(2); // capability + data fetch, cache hit on second
      });

      it('should handle JSON parse error in getTestDetails', async () => {
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: 'invalid json' });
        
        const result = await getTestDetails('/test.xcresult', 'test-id');
        expect(result).toBeNull();
      });
    });

    describe('clearCache', () => {
      it('should clear all caches', async () => {
        // Set up some cached data
        mockExeca
          .mockResolvedValueOnce({ stdout: 'get test-report' })
          .mockResolvedValueOnce({ stdout: '{"first": true}' })
          .mockResolvedValueOnce({ stdout: 'get test-report' }) // capability check after clear
          .mockResolvedValueOnce({ stdout: '{"second": true}' });
        
        await getSummary('/test.xcresult');
        clearCache();
        
        const result = await getSummary('/test.xcresult');
        expect(result).toEqual({ second: true });
        expect(mockExeca).toHaveBeenCalledTimes(4); // cap+data, then cap+data after clear
      });
    });
  });
});