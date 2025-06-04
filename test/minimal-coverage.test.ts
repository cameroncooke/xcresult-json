// Minimal tests to achieve coverage without chalk issues
import { initializeValidator } from '../src/validator';
import { getSchema, getSummary, getTestDetails, clearCache } from '../src/xcjson';
import { execa } from 'execa';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

import * as schema from '../src/schema';
const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;
const mockExeca = execa as jest.Mock;

describe('Minimal Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
  });

  // Test validator without chalk warnings
  it('should not reinitialize validator', async () => {
    mockGetLiveSchema.mockResolvedValueOnce({ type: 'object' });
    
    await initializeValidator();
    await initializeValidator(); // Should hit early return (line 15)
    
    expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
  });

  // Test xcjson getSchema success path
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

  // Test checkCapabilities caching (line 22-24)
  it('should cache capability check', async () => {
    const mockSchema = { type: 'object' };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({
        stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
      })
      .mockResolvedValueOnce({
        stdout: `Command output structure (JSON Schema):\n${JSON.stringify(mockSchema)}`
      });
    
    await getSchema('tests');
    await getSchema('tests'); // Should use cached capability check
    
    expect(mockExeca).toHaveBeenCalledTimes(3); // 1 capability + 2 data calls
  });

  // Test getSummary success path
  it('should get summary successfully', async () => {
    const mockData = { summary: true };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
    
    const result = await getSummary('/test.xcresult');
    expect(result).toEqual(mockData);
  });

  // Test getTestDetails success path  
  it('should get test details successfully', async () => {
    const mockDetails = { details: true };
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
    
    const result = await getTestDetails('/test.xcresult', 'test-id');
    expect(result).toEqual(mockDetails);
  });

  // Test cache overflow (line 25 in cache.ts)
  it('should handle cache overflow', async () => {
    const mock1 = { test: 1 };
    const mock2 = { test: 2 };
    const mock3 = { test: 3 };
    const mock4 = { test: 4 }; // This will cause eviction
    
    mockExeca
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mock1) })
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mock2) })
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mock3) })
      .mockResolvedValueOnce({ stdout: 'get test-report' })
      .mockResolvedValueOnce({ stdout: JSON.stringify(mock4) });
    
    await getSummary('/test1.xcresult');
    await getSummary('/test2.xcresult');
    await getSummary('/test3.xcresult');
    await getSummary('/test4.xcresult'); // Triggers eviction
    
    expect(mockExeca).toHaveBeenCalledTimes(8);
  });
});