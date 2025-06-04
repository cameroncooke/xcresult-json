import { LRUCache } from '../src/cache';

describe('LRUCache', () => {
  it('should store and retrieve values', () => {
    const cache = new LRUCache<string, number>(3);
    
    cache.set('a', 1);
    cache.set('b', 2);
    
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBeUndefined();
  });

  it('should evict least recently used items when capacity is exceeded', () => {
    const cache = new LRUCache<string, number>(3);
    
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // Should evict 'a'
    
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should update LRU order on get', () => {
    const cache = new LRUCache<string, number>(3);
    
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    
    cache.get('a'); // Move 'a' to end
    cache.set('d', 4); // Should evict 'b', not 'a'
    
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should clear all items', () => {
    const cache = new LRUCache<string, number>(3);
    
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('should report correct size', () => {
    const cache = new LRUCache<string, number>(3);
    
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    expect(cache.size).toBe(1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });

  it('should check if key exists', () => {
    const cache = new LRUCache<string, number>(3);
    
    cache.set('a', 1);
    
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });
});