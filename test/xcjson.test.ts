import { getSummary, getTestDetails, clearCache, XcjsonError } from '../src/xcjson';
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
    it('should create error with message and code', () => {
      const error = new XcjsonError('Test error', 2);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(2);
      expect(error.name).toBe('XcjsonError');
    });

    it('should create error without code', () => {
      const error = new XcjsonError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBeUndefined();
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new XcjsonError('Test error', 2);
      }).toThrow(XcjsonError);
    });
  });

  describe('getSummary', () => {
    it('should get summary using modern format (Xcode 16+)', async () => {
      const mockData = { testNodes: [{ nodeType: 'Test Suite', name: 'TestSuite' }] };
      
      // Mock version detection
      mockExeca
        .mockResolvedValueOnce({ stdout: 'xcresulttool version 23714' })
        .mockResolvedValueOnce({ stdout: 'Subcommands:\n  get    Get information from xcresult' })
        .mockResolvedValueOnce({ stdout: 'object\ntest-results' })
        // Mock actual data fetch
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result = await getSummary('/test.xcresult');
      expect(result).toEqual(mockData);
      
      // Verify modern command was used
      expect(mockExeca).toHaveBeenCalledWith('xcrun', [
        'xcresulttool',
        'get',
        'test-results',
        '--path',
        '/test.xcresult',
        '--format',
        'json'
      ]);
    });

    it('should get summary using legacy format (Xcode 15.x)', async () => {
      const mockData = { actions: { _values: [{ startedTime: { _value: '2024-01-01' } }] } };
      
      // Mock version detection
      mockExeca
        .mockResolvedValueOnce({ stdout: 'xcresulttool version 22608' })
        .mockResolvedValueOnce({ stdout: 'get    Get information from xcresult' })
        // Mock actual data fetch with malformed JSON fix
        .mockResolvedValueOnce({ 
          stdout: JSON.stringify(mockData).replace(
            'optional\\ncomponents',
            'optional\ncomponents'
          )
        });
      
      const result = await getSummary('/test.xcresult');
      expect(result).toEqual(mockData);
      
      // Verify Xcode 15.x uses get object (without --legacy for latest format)
      expect(mockExeca).toHaveBeenCalledWith('xcrun', [
        'xcresulttool',
        'get',
        'object',
        '--path',
        '/test.xcresult',
        '--format',
        'json'
      ]);
    });

    it('should handle invalid bundle error', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: 'xcresulttool version 23714' })
        .mockResolvedValueOnce({ stdout: 'Subcommands:\n  get' })
        .mockResolvedValueOnce({ stdout: 'test-results' })
        .mockRejectedValueOnce({
          exitCode: 1,
          stderr: 'Error: not a valid .xcresult bundle at path',
          message: 'Command failed: not a valid .xcresult bundle'
        });
      
      await expect(getSummary('/invalid.xcresult')).rejects.toThrow(XcjsonError);
    });

    it('should handle xcresulttool not found', async () => {
      mockExeca.mockRejectedValueOnce(new Error('xcresulttool not found'));
      
      await expect(getSummary('/test.xcresult')).rejects.toMatchObject({
        code: 1,
        message: expect.stringContaining('Failed to run xcresulttool')
      });
    });

    it('should cache results', async () => {
      const mockData = { cached: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'xcresulttool version 23714' })
        .mockResolvedValueOnce({ stdout: 'Subcommands:\n  get' })
        .mockResolvedValueOnce({ stdout: 'test-results' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      const result1 = await getSummary('/test.xcresult');
      const result2 = await getSummary('/test.xcresult'); // Should use cache
      
      expect(result1).toEqual(result2);
      expect(mockExeca).toHaveBeenCalledTimes(4); // version + help checks + data, no second data call
    });
  });

  describe('getTestDetails', () => {
    it('should get test details successfully', async () => {
      const mockDetails = { failureSummaries: { _values: [] } };
      
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result = await getTestDetails('/test.xcresult', 'test-id');
      expect(result).toEqual(mockDetails);
      
      // Verify legacy command format
      expect(mockExeca).toHaveBeenCalledWith('xcrun', [
        'xcresulttool',
        'get',
        '--legacy',
        '--path',
        '/test.xcresult',
        '--id',
        'test-id',
        '--format',
        'json'
      ]);
    });

    it('should return null and warn on error', async () => {
      mockExeca.mockRejectedValueOnce(new Error('Test not found'));
      
      const result = await getTestDetails('/test.xcresult', 'missing-id');
      
      expect(result).toBeNull();
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get test details for missing-id:'),
        expect.any(Error)
      );
    });

    it('should cache test details', async () => {
      const mockDetails = { details: 'cached' };
      
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify(mockDetails) });
      
      const result1 = await getTestDetails('/test.xcresult', 'test-id');
      const result2 = await getTestDetails('/test.xcresult', 'test-id');
      
      expect(result1).toEqual(result2);
      expect(mockExeca).toHaveBeenCalledTimes(1); // Only one call
    });
  });

  describe('clearCache', () => {
    it('should clear cache without throwing', () => {
      expect(() => clearCache()).not.toThrow();
    });

    it('should clear all caches', async () => {
      const mockData = { test: 'data' };
      
      mockExeca
        .mockResolvedValueOnce({ stdout: 'xcresulttool version 23714' })
        .mockResolvedValueOnce({ stdout: 'Subcommands:\n  get' })
        .mockResolvedValueOnce({ stdout: 'test-results' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      await getSummary('/test.xcresult');
      clearCache();
      
      // After clearing cache, should make new calls
      mockExeca
        .mockResolvedValueOnce({ stdout: 'xcresulttool version 23714' })
        .mockResolvedValueOnce({ stdout: 'Subcommands:\n  get' })
        .mockResolvedValueOnce({ stdout: 'test-results' })
        .mockResolvedValueOnce({ stdout: JSON.stringify(mockData) });
      
      await getSummary('/test.xcresult');
      
      expect(mockExeca).toHaveBeenCalledTimes(8); // 2x capability checks + data calls
    });
  });
});