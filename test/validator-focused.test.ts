import { initializeValidator, validate, validateAndLog } from '../src/validator';

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

import * as schema from '../src/schema';
const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;

// Mock console
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

describe('Validator Module Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    // Reset module state
    (global as any).compiledValidator = null;
  });

  it('should validate without initialized validator', () => {
    const result = validate({ any: 'data' });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should initialize validator successfully', async () => {
    const testSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    };
    
    mockGetLiveSchema.mockResolvedValueOnce(testSchema);
    await initializeValidator();
    
    // Test valid data
    const validResult = validate({ name: 'test' });
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toBeUndefined();
  });

  it('should handle validation failure and warn', async () => {
    const testSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    };
    
    mockGetLiveSchema.mockResolvedValueOnce(testSchema);
    await initializeValidator();
    
    // Test invalid data - this should trigger warning and error logging
    const invalidResult = validate({ wrongField: 123 });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toBeDefined();
    expect(mockConsole.warn).toHaveBeenCalledTimes(2); // Warning + errors
  });

  it('should handle validator initialization failure', async () => {
    const error = new Error('Schema fetch failed');
    mockGetLiveSchema.mockRejectedValueOnce(error);
    
    await initializeValidator();
    
    // Should still work but warn
    expect(mockConsole.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Failed to initialize validator: Schema fetch failed')
    );
    
    // Should pass through without validation
    const result = validate({ any: 'data' });
    expect(result.valid).toBe(true);
  });

  it('should not reinitialize when already initialized', async () => {
    const testSchema = { type: 'object' };
    mockGetLiveSchema.mockResolvedValueOnce(testSchema);
    
    await initializeValidator();
    await initializeValidator(); // Second call should return early
    
    expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
  });

  it('should handle validateAndLog with valid data', async () => {
    const testSchema = {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id']
    };
    
    mockGetLiveSchema.mockResolvedValueOnce(testSchema);
    await initializeValidator();
    
    const validData = { id: 123 };
    const result = validateAndLog(validData, 'test context');
    
    expect(result).toBe(validData);
    expect(mockConsole.warn).not.toHaveBeenCalled();
  });

  it('should handle validateAndLog with invalid data and warn', async () => {
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
    expect(mockConsole.warn).toHaveBeenCalledWith(
      expect.stringContaining('Schema validation failed for test context')
    );
  });

  it('should handle validateAndLog without initialized validator', () => {
    const data = { test: 'data' };
    const result = validateAndLog(data, 'context');
    
    expect(result).toBe(data);
    expect(mockConsole.warn).not.toHaveBeenCalled();
  });
});