/**
 * Test utilities for loading fixtures and testing parsers directly
 * This bypasses the CLI and tests the parser functions directly
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseXCResult } from '../src/api.js';

/**
 * Load a JSON fixture file for testing
 */
export function loadJsonFixture(filename: string): any {
  const fixturePath = join(__dirname, 'fixtures', filename);
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
}

/**
 * Test a parser directly with JSON data (bypassing xcresulttool)
 * This is for unit testing parsers without requiring real xcresult bundles
 */
export async function testParserWithJsonData(jsonData: any, bundlePath = '/test'): Promise<any> {
  // This function is deprecated - use API tests instead
  throw new Error('testParserWithJsonData is deprecated - use parseXCResult from api.js');
}

/**
 * Mock xcresulttool responses for testing
 */
export function mockXcresulttoolResponse(mockData: any) {
  jest.mock('execa');
  const { execa } = require('execa');
  execa.mockResolvedValue({
    stdout: JSON.stringify(mockData)
  });
  return execa;
}

/**
 * Test CLI behavior without actually calling xcresulttool
 * This is for integration testing the full flow
 */
export async function testCliWithMockedXcresulttool(bundlePath: string, mockData: any) {
  const mockExeca = mockXcresulttoolResponse(mockData);
  
  try {
    const result = await parseXCResult(bundlePath);
    return result;
  } finally {
    mockExeca.mockRestore();
  }
}