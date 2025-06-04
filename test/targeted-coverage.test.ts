import { initializeValidator, validate, validateAndLog } from '../src/validator';
import { getSchema, getSummary, getTestDetails, clearCache } from '../src/xcjson';
import { execa } from 'execa';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

import * as schema from '../src/schema';
const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;
const mockExeca = execa as jest.Mock;

describe('Targeted Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
  });

  // Test validator initialization failure (line 21)
  it('should handle validator initialization failure', async () => {
    const error = new Error('Schema fetch failed');
    mockGetLiveSchema.mockRejectedValueOnce(error);
    
    await initializeValidator();
    
    // After failure, should still work without validation
    const result = validate({ any: 'data' });
    expect(result.valid).toBe(true);
  });

  // Test validator not reinitializing (line 15)
  it('should not reinitialize validator', async () => {
    mockGetLiveSchema.mockResolvedValueOnce({ type: 'object' });
    
    await initializeValidator();
    await initializeValidator(); // Should return early due to line 15
    
    expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
  });

  // Test validation with errors (lines 35-37)
  it('should handle validation with errors', async () => {
    const testSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    };
    
    mockGetLiveSchema.mockResolvedValueOnce(testSchema);
    await initializeValidator();
    
    const result = validate({ wrongField: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  // Test validateAndLog with validation failure (lines 50-53)
  it('should handle validateAndLog with failure', async () => {
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
  });

  // Test xcjson capability check failure (line 31)
  it('should handle xcjson capability check failure', async () => {
    mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
    
    await expect(getSchema('tests')).rejects.toMatchObject({
      code: 'XCRESULTTOOL_NOT_FOUND',
      exitCode: 1
    });
  });

  // Test schema parsing with complex JSON structure
  it('should handle complex schema parsing', async () => {
    const complexSchema = { 
      type: 'object',
      properties: { nested: { type: 'object' } }
    };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({
        stdout: `Command output structure (JSON Schema):\n${JSON.stringify(complexSchema)}`
      });
    
    const result = await getSchema('tests');
    expect(result).toEqual(complexSchema);
  });

  // Test JSON parsing failure (line 79)
  it('should handle JSON parsing failure in schema', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({
        stdout: 'Command output structure (JSON Schema):\n{invalid json'
      });
    
    await expect(getSchema('tests')).rejects.toMatchObject({
      code: 'SCHEMA_PARSE_ERROR'
    });
  });

  // Test schema fetch error (line 85)
  it('should handle schema fetch error', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockRejectedValueOnce(new Error('Command failed'));
    
    await expect(getSchema('tests')).rejects.toMatchObject({
      code: 'SCHEMA_FETCH_ERROR'
    });
  });

  // Test getSummary JSON parse error (line 98)
  it('should handle getSummary JSON parse error', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: 'invalid json' });
    
    await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
      code: 'SUMMARY_FETCH_ERROR'
    });
  });

  // Test invalid bundle detection (lines 109-113)
  it('should handle invalid bundle detection', async () => {
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

  // Test getSummary capability check error (line 126)
  it('should handle getSummary capability check error', async () => {
    mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
    
    await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
      code: 'XCRESULTTOOL_NOT_FOUND',
      exitCode: 1
    });
  });

  // Test getTestDetails error warning (line 154)
  it('should handle getTestDetails error with warning', async () => {
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockRejectedValueOnce(new Error('Test not found'));
    
    const result = await getTestDetails('/test.xcresult', 'missing-id');
    expect(result).toBeNull();
  });

  // Test successful paths to ensure branches are covered
  it('should handle successful getSchema', async () => {
    const mockSchema = { type: 'object' };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({
        stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
      });
    
    const result = await getSchema('tests');
    expect(result).toEqual(mockSchema);
  });

  it('should handle successful getSummary', async () => {
    const mockData = { summary: true };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
    
    const result = await getSummary('/test.xcresult');
    expect(result).toEqual(mockData);
  });

  it('should handle successful getTestDetails', async () => {
    const mockDetails = { details: true };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
    
    const result = await getTestDetails('/test.xcresult', 'test-id');
    expect(result).toEqual(mockDetails);
  });
});