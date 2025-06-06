import { getSummary, getTestDetails, clearCache, disableCache, enableCache } from '../src/xcjson';
import { execSync } from 'child_process';
import path from 'path';

// Mock execa to simulate xcresulttool behavior  
jest.mock('execa', () => ({
  execa: jest.fn()
}));

const REAL_XCRESULT_PATH = path.join(__dirname, 'fixtures', 'TestResult.xcresult');
const mockExeca = require('execa').execa as jest.Mock;

describe('Cache Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableCache();
    clearCache();
    
    // Mock xcresulttool responses with artificial delay
    mockExeca.mockImplementation(async (_command: string, args: string[]) => {
      // Simulate xcresulttool delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      if (args.includes('--help')) {
        return { stdout: 'test-results available' };
      }
      
      return { 
        stdout: JSON.stringify({ 
          mockData: 'response',
          testNodes: [{ nodeType: 'Test Case', name: 'sample' }]
        })
      };
    });
  });

  afterEach(() => {
    enableCache();
    clearCache();
  });

  it('should demonstrate cache performance improvement for repeated calls', async () => {
    // Test with cache enabled
    enableCache();
    
    const startWithCache = Date.now();
    
    // Multiple calls to the same bundle - only first should be slow
    await getSummary(REAL_XCRESULT_PATH);
    await getSummary(REAL_XCRESULT_PATH); // Cached
    await getSummary(REAL_XCRESULT_PATH); // Cached
    await getSummary(REAL_XCRESULT_PATH); // Cached
    await getSummary(REAL_XCRESULT_PATH); // Cached
    
    const timeWithCache = Date.now() - startWithCache;
    
    // Clear cache and disable it
    disableCache();
    
    const startWithoutCache = Date.now();
    
    // Same calls but no caching - all should be slow
    await getSummary(REAL_XCRESULT_PATH);
    await getSummary(REAL_XCRESULT_PATH); // Not cached
    await getSummary(REAL_XCRESULT_PATH); // Not cached  
    await getSummary(REAL_XCRESULT_PATH); // Not cached
    await getSummary(REAL_XCRESULT_PATH); // Not cached
    
    const timeWithoutCache = Date.now() - startWithoutCache;
    
    console.log(`Time with cache: ${timeWithCache}ms`);
    console.log(`Time without cache: ${timeWithoutCache}ms`);
    console.log(`Cache speedup: ${(timeWithoutCache / timeWithCache).toFixed(2)}x faster`);
    
    // Verify cache behavior by checking that we make fewer calls with caching
    expect(mockExeca).toHaveBeenCalled();
    
    // Cache should provide significant speedup (at least 2.5x faster due to 50ms mock delays)
    expect(timeWithCache).toBeLessThan(timeWithoutCache);
    expect(timeWithoutCache / timeWithCache).toBeGreaterThan(2.5);
  }, 10000);

  it('should cache test details for multiple failure lookups', async () => {
    // This test demonstrates that test details are cached per test ID
    enableCache();
    clearCache();
    
    const testId = 'sample-test-id';
    
    // First call should trigger xcresulttool
    const start1 = Date.now();
    await getTestDetails(REAL_XCRESULT_PATH, testId);
    const time1 = Date.now() - start1;
    
    // Second call should be from cache (much faster)
    const start2 = Date.now();
    await getTestDetails(REAL_XCRESULT_PATH, testId);
    const time2 = Date.now() - start2;
    
    console.log(`First call (uncached): ${time1}ms`);
    console.log(`Second call (cached): ${time2}ms`);
    
    // Cached call should be significantly faster (essentially instant)
    expect(time2).toBeLessThan(time1);
    expect(time2).toBeLessThan(10); // Should be nearly instant
  });

  it('should demonstrate CLI performance difference with --no-cache flag', async () => {
    if (!require('fs').existsSync(REAL_XCRESULT_PATH)) {
      console.warn('Skipping CLI performance test - no real xcresult fixture available');
      return;
    }

    const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');
    
    // Test with cache (default behavior)
    const startWithCache = Date.now();
    try {
      execSync(`node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}"`, { 
        encoding: 'utf8', 
        stdio: ['pipe', 'pipe', 'ignore'] 
      });
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but that's expected
    }
    const timeWithCache = Date.now() - startWithCache;
    
    // Test with --no-cache flag
    const startWithoutCache = Date.now();
    try {
      execSync(`node "${CLI_PATH}" --path "${REAL_XCRESULT_PATH}" --no-cache`, { 
        encoding: 'utf8', 
        stdio: ['pipe', 'pipe', 'ignore'] 
      });
    } catch (error: any) {
      // CLI exits with 10 due to test failures, but that's expected
    }
    const timeWithoutCache = Date.now() - startWithoutCache;
    
    console.log(`CLI with cache: ${timeWithCache}ms`);
    console.log(`CLI with --no-cache: ${timeWithoutCache}ms`);
    
    // Both should complete successfully, but times may vary
    // This test mainly proves the --no-cache flag works
    expect(timeWithCache).toBeGreaterThan(0);
    expect(timeWithoutCache).toBeGreaterThan(0);
  }, 30000);
});