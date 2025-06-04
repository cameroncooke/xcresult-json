import { XcjsonError, clearCache } from '../src/xcjson';

describe('XcjsonError and Basic Functions', () => {
  describe('XcjsonError', () => {
    it('should create error with message, code, and exitCode', () => {
      const error = new XcjsonError('Test failed', 'TEST_FAIL', 1);
      
      expect(error.message).toBe('Test failed');
      expect(error.code).toBe('TEST_FAIL');
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe('XcjsonError');
      expect(error instanceof Error).toBe(true);
    });

    it('should create error without exitCode', () => {
      const error = new XcjsonError('Another test', 'ANOTHER_CODE');
      
      expect(error.message).toBe('Another test');
      expect(error.code).toBe('ANOTHER_CODE');
      expect(error.exitCode).toBeUndefined();
      expect(error.name).toBe('XcjsonError');
    });

    it('should be throwable and catchable', () => {
      const error = new XcjsonError('Throwable', 'THROW_CODE', 99);
      
      expect(() => {
        throw error;
      }).toThrow(XcjsonError);
      
      try {
        throw error;
      } catch (caught) {
        expect(caught).toBeInstanceOf(XcjsonError);
        expect((caught as XcjsonError).code).toBe('THROW_CODE');
        expect((caught as XcjsonError).exitCode).toBe(99);
      }
    });
  });

  describe('clearCache', () => {
    it('should clear cache without throwing', () => {
      expect(() => clearCache()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      expect(() => {
        clearCache();
        clearCache();
        clearCache();
      }).not.toThrow();
    });
  });
});