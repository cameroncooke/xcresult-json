import { promises as fs } from 'fs';
import { fetchAndSaveSchema, loadSchema, getLiveSchema } from '../src/schema';
import * as xcjson from '../src/xcjson';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
}));
jest.mock('../src/xcjson');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGetSchema = xcjson.getSchema as jest.Mock;

describe('schema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAndSaveSchema', () => {
    it('should fetch and save schema to file', async () => {
      const mockSchema = { type: 'object', properties: {} };
      mockGetSchema.mockResolvedValueOnce(mockSchema);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await fetchAndSaveSchema();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('src/schema'),
        { recursive: true }
      );
      expect(mockGetSchema).toHaveBeenCalledWith('tests');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('tests.json'),
        JSON.stringify(mockSchema, null, 2)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Schema saved to')
      );

      consoleLogSpy.mockRestore();
    });

    it('should propagate errors', async () => {
      const error = new Error('Schema fetch failed');
      mockGetSchema.mockRejectedValueOnce(error);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(fetchAndSaveSchema()).rejects.toThrow(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch and save schema:',
        error.message
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('loadSchema', () => {
    it('should load schema from file if exists', async () => {
      const mockSchema = { type: 'object', loaded: true };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockSchema));

      const result = await loadSchema();

      expect(result).toEqual(mockSchema);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('tests.json'),
        'utf-8'
      );
      expect(mockGetSchema).not.toHaveBeenCalled();
    });

    it('should fetch and save schema if file does not exist', async () => {
      const mockSchema = { type: 'object', fetched: true };
      mockFs.readFile
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(JSON.stringify(mockSchema));
      mockGetSchema.mockResolvedValueOnce(mockSchema);
      
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await loadSchema();

      expect(result).toEqual(mockSchema);
      expect(mockGetSchema).toHaveBeenCalledWith('tests');
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Schema file not found, fetching from xcresulttool...'
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('getLiveSchema', () => {
    it('should return live schema when available', async () => {
      const mockSchema = { type: 'object', live: true };
      mockGetSchema.mockResolvedValueOnce(mockSchema);

      const result = await getLiveSchema();

      expect(result).toEqual(mockSchema);
      expect(mockGetSchema).toHaveBeenCalledWith('tests');
    });

    it('should fall back to cached schema on error', async () => {
      const cachedSchema = { type: 'object', cached: true };
      mockGetSchema.mockRejectedValueOnce(new Error('Network error'));
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(cachedSchema));
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await getLiveSchema();

      expect(result).toEqual(cachedSchema);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get live schema'),
        expect.stringContaining('Network error')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});