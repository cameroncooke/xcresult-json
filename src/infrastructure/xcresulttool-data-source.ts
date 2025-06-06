/**
 * Infrastructure layer - xcresulttool implementation
 * This contains all the implementation details that should be mockable
 */

import { readFileSync } from 'fs';
import { execa } from 'execa';
import { XCResultDataSource, DataSourceOptions } from '../core/interfaces.js';
import { XCResultError } from '../core/errors.js';
import { LRUCache } from '../cache.js';

/**
 * xcresulttool-based data source implementation
 * Handles all xcresulttool interaction details
 */
export class XCResultToolDataSource implements XCResultDataSource {
  private cache = new LRUCache<string, any>(100);
  private options: Required<DataSourceOptions>;

  constructor(options: DataSourceOptions = {}) {
    this.options = {
      cache: options.cache ?? true,
      validate: options.validate ?? false,
    };
  }

  async getData(bundlePath: string): Promise<any> {
    // Handle JSON fixture files (for testing)
    if (bundlePath.endsWith('.json')) {
      return this.loadJsonFixture(bundlePath);
    }

    // Validate xcresult bundle
    if (!bundlePath.endsWith('.xcresult')) {
      throw XCResultError.invalidBundle(bundlePath);
    }

    // Check cache first
    if (this.options.cache && this.cache.has(bundlePath)) {
      return this.cache.get(bundlePath);
    }

    try {
      // Detect xcresulttool capabilities
      const capabilities = await this.detectCapabilities();

      // Get data using appropriate command
      const data = await this.executeXCResultTool(bundlePath, capabilities);

      // Cache result
      if (this.options.cache) {
        this.cache.set(bundlePath, data);
      }

      return data;
    } catch (error) {
      if (error instanceof XCResultError) {
        throw error;
      }
      throw XCResultError.xcresulttoolFailed(error as Error);
    }
  }

  private loadJsonFixture(path: string): any {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw XCResultError.invalidBundle(path);
    }
  }

  private async detectCapabilities(): Promise<XCResultToolCapabilities> {
    try {
      const { stdout } = await execa('xcrun', ['xcresulttool', 'version']);
      const versionMatch = stdout.match(/version (\d+)/);
      const version = versionMatch ? parseInt(versionMatch[1]) : 0;

      return {
        version,
        supportsTestResults: version >= 23000, // Xcode 16+
        supportsGetObject: version >= 22000, // Xcode 15+
        supportsLegacy: true,
      };
    } catch {
      throw XCResultError.xcresulttoolNotFound();
    }
  }

  private async executeXCResultTool(
    bundlePath: string,
    capabilities: XCResultToolCapabilities
  ): Promise<any> {
    // Try modern format first (Xcode 16+)
    if (capabilities.supportsTestResults) {
      try {
        const { stdout } = await execa('xcrun', [
          'xcresulttool',
          'get',
          'test-results',
          'summary',
          '--path',
          bundlePath,
          '--format',
          'json',
        ]);
        return JSON.parse(stdout);
      } catch {
        console.warn('Modern format failed, falling back to object format');
      }
    }

    // Try object format (Xcode 15+)
    if (capabilities.supportsGetObject) {
      try {
        const { stdout } = await execa('xcrun', [
          'xcresulttool',
          'get',
          'object',
          '--path',
          bundlePath,
          '--format',
          'json',
        ]);
        return JSON.parse(stdout);
      } catch {
        console.warn('Object format failed, falling back to legacy format');
      }
    }

    // Fall back to legacy format
    const { stdout } = await execa('xcrun', [
      'xcresulttool',
      'get',
      'object',
      '--legacy',
      '--path',
      bundlePath,
      '--format',
      'json',
    ]);
    return JSON.parse(stdout);
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

interface XCResultToolCapabilities {
  version: number;
  supportsTestResults: boolean;
  supportsGetObject: boolean;
  supportsLegacy: boolean;
}
