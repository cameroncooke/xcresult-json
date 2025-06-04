import { LRUCache } from '../src/cache';

describe('Cache Overflow Test', () => {
  it('should evict items when cache exceeds capacity', () => {
    const cache = new LRUCache<string, string>(3);
    
    // Fill cache to capacity
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    
    expect(cache.size).toBe(3);
    expect(cache.has('key1')).toBe(true);
    
    // Add fourth item - should evict key1
    cache.set('key4', 'value4');
    
    expect(cache.size).toBe(3);
    expect(cache.has('key1')).toBe(false); // Evicted
    expect(cache.has('key4')).toBe(true);  // New item
    
    // This tests line 25 in cache.ts where firstKey could be undefined
    // But in this case it won't be undefined since we have items
  });

  it('should handle eviction when cache is empty', () => {
    const cache = new LRUCache<string, string>(0); // Zero capacity
    
    cache.set('key1', 'value1'); // Should immediately evict
    
    expect(cache.size).toBe(0);
    expect(cache.has('key1')).toBe(false);
  });
});