// Simple tests to increase coverage without triggering chalk issues
import { validate } from '../src/validator';

// Mock schema module  
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

describe('Simple Coverage Tests', () => {
  it('should validate without initialized validator', () => {
    // This hits the early return path in validate (lines 27-30)
    const result = validate({ any: 'data' });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });
});