import { initializeValidator, validate, validateAndLog, resetValidator } from '../src/validator';
import * as schema from '../src/schema';

// Mock chalk
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    yellow: jest.fn((text: string) => text),
    green: jest.fn((text: string) => text),
    red: jest.fn((text: string) => text),
  },
}));

// Mock schema module
jest.mock('../src/schema', () => ({
  getLiveSchema: jest.fn(),
}));

const mockGetLiveSchema = schema.getLiveSchema as jest.Mock;

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

describe('Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    resetValidator();
  });

  describe('validate', () => {
    it('should pass validation when no validator is initialized', () => {
      const result = validate({ any: 'data' });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate successfully with correct schema', async () => {
      const testSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const validData = { name: 'test' };
      const result = validate(validData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect validation failures and warn', async () => {
      const testSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const invalidData = { wrongField: 123 };
      const result = validate(invalidData);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(mockConsole.error).toHaveBeenCalledWith('Warning: JSON payload does not match schema');
      expect(mockConsole.error).toHaveBeenCalledWith('Validation errors:', result.errors);
    });
  });

  describe('initializeValidator', () => {
    it('should initialize validator successfully', async () => {
      const testSchema = { type: 'object', properties: {} };
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      
      await initializeValidator();
      
      expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization failure with warning', async () => {
      const error = new Error('Schema fetch failed');
      mockGetLiveSchema.mockRejectedValueOnce(error);
      
      await initializeValidator();
      
      expect(mockConsole.error).toHaveBeenCalledWith('Warning: Failed to initialize validator: Schema fetch failed');
    });

    it('should not reinitialize when already initialized', async () => {
      const testSchema = { type: 'object' };
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      
      await initializeValidator();
      await initializeValidator(); // Second call should return early
      
      expect(mockGetLiveSchema).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateAndLog', () => {
    it('should handle valid data without warnings', async () => {
      const testSchema = {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const validData = { id: 'test-123' };
      const result = validateAndLog(validData, 'test context');
      
      expect(result).toBe(validData);
      // Validator now logs "Schema validation enabled" on successful initialization
      expect(mockConsole.error).toHaveBeenCalledWith('Schema validation enabled');
    });

    it('should handle invalid data with context warning', async () => {
      const testSchema = {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      };
      
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      const invalidData = { notAnId: 'wrong' };
      const result = validateAndLog(invalidData, 'test context');
      
      expect(result).toBe(invalidData);
      expect(mockConsole.error).toHaveBeenCalledWith('Schema validation failed for test context');
    });

    it('should work without initialized validator', () => {
      const anyData = { any: 'data' };
      const result = validateAndLog(anyData, 'test context');
      
      expect(result).toBe(anyData);
      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe('resetValidator', () => {
    it('should reset validator state', async () => {
      const testSchema = { type: 'object' };
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      
      await initializeValidator();
      resetValidator();
      
      // After reset, should initialize again
      mockGetLiveSchema.mockResolvedValueOnce(testSchema);
      await initializeValidator();
      
      expect(mockGetLiveSchema).toHaveBeenCalledTimes(2);
    });
  });
});