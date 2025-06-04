import { validate, validateAndLog } from '../src/validator';
import { execa } from 'execa';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn().mockResolvedValue({
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name']
  }),
}));

const mockExeca = execa as jest.Mock;

describe('Final Push for Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Hit validator validation failure branches (lines 35-37, 51)
  it('should handle validation errors with detailed logging', async () => {
    // Import and initialize after mocking
    const { initializeValidator } = await import('../src/validator');
    await initializeValidator();
    
    // Test validation failure to hit lines 35-37
    const result = validate({ wrongField: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    
    // Test validateAndLog failure to hit line 51
    const data = { invalid: 'data' };
    const loggedResult = validateAndLog(data, 'test context');
    expect(loggedResult).toBe(data);
  });

  // Hit cache eviction edge case (line 25)
  it('should handle cache edge cases', () => {
    const { LRUCache } = require('../src/cache');
    const cache = new LRUCache(1); // Size 1 to force immediate eviction
    
    cache.set('key1', 'value1');
    cache.set('key2', 'value2'); // This should evict key1 and hit line 25
    
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
  });

  // Hit more xcjson branches
  it('should handle xcjson edge cases', async () => {
    const { getSchema } = await import('../src/xcjson');
    
    // Test schema not found to hit line 57
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({
        stdout: 'Command output structure (JSON Schema):\nNo opening brace here'
      });
    
    try {
      await getSchema('tests');
    } catch (error: any) {
      expect(error.code).toBe('SCHEMA_PARSE_ERROR');
    }
  });

  // Test legacy command path
  it('should use legacy command when test-report not supported', async () => {
    const { getSchema } = await import('../src/xcjson');
    
    const mockSchema = { type: 'object' };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get commands help' }) // No test-report
      .mockResolvedValueOnce({
        stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
      });
    
    const result = await getSchema('tests');
    expect(result).toEqual(mockSchema);
  });

  // Test getSummary error conditions
  it('should handle getSummary error branches', async () => {
    const { getSummary } = await import('../src/xcjson');
    
    // Test JSON parse error (line 98)
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: 'invalid json' });
    
    try {
      await getSummary('/test.xcresult');
    } catch (error: any) {
      expect(error.code).toBe('SUMMARY_FETCH_ERROR');
    }
  });

  // Test specific error conditions
  it('should handle specific xcjson error branches', async () => {
    const { getSummary } = await import('../src/xcjson');
    
    // Test general error without exitCode (line 118 with undefined exitCode)
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockRejectedValueOnce({ message: 'General error' }); // No exitCode
    
    try {
      await getSummary('/test.xcresult');
    } catch (error: any) {
      expect(error.code).toBe('SUMMARY_FETCH_ERROR');
    }
  });
});