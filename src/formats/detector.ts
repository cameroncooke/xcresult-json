import { execa } from 'execa';
import { XcresulttoolCapabilities } from './types.js';

/**
 * Detect xcresulttool capabilities based on version
 */
export async function detectCapabilities(): Promise<XcresulttoolCapabilities> {
  try {
    // Get version to determine capabilities
    const { stdout: versionOutput } = await execa('xcrun', ['xcresulttool', 'version']);
    const versionMatch = versionOutput.match(/version (\d+)/);
    const version = versionMatch ? parseInt(versionMatch[1]) : 0;

    // Check capabilities by trying help commands
    let supportsGetObject = false;
    let supportsGetTestResults = false;
    let supportsLegacyFlag = false;
    let commandFormat: 'modern' | 'legacy' | 'basic' = 'basic';

    try {
      // Check if 'get' is a subcommand or direct command
      const { stdout: helpOutput } = await execa('xcrun', ['xcresulttool', '--help']);
      
      if (helpOutput.includes('Subcommands:') && helpOutput.includes('get')) {
        // Modern format - 'get' is a subcommand
        try {
          const { stdout: getHelp } = await execa('xcrun', ['xcresulttool', 'get', '--help']);
          supportsGetObject = getHelp.includes('object');
          supportsGetTestResults = getHelp.includes('test-results');
          supportsLegacyFlag = getHelp.includes('--legacy');
        } catch {
          // 'get' subcommand exists but we can't get its help
        }
        commandFormat = supportsGetTestResults ? 'modern' : 'legacy';
      } else if (helpOutput.includes('get') && !helpOutput.includes('Subcommands:')) {
        // Basic format - 'get' is a direct command
        supportsGetObject = false;
        supportsGetTestResults = false;
        supportsLegacyFlag = helpOutput.includes('--legacy');
        commandFormat = 'basic';
      }
    } catch {
      // Can't get help, assume basic format
    }

    // Version-based overrides
    if (version >= 23000) {
      // Xcode 16+ versions
      commandFormat = 'modern';
      supportsGetTestResults = true;
      supportsGetObject = true;
    } else if (version >= 22000 && version < 23000) {
      // Xcode 15.x versions
      commandFormat = 'legacy';
      supportsGetObject = true;
      supportsLegacyFlag = true;
    }

    return {
      version,
      supportsGetObject,
      supportsGetTestResults,
      supportsLegacyFlag,
      commandFormat,
    };
  } catch (error) {
    throw new Error(`Failed to detect xcresulttool capabilities: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get xcresult data using the appropriate command format
 */
export async function getXcresultData(bundlePath: string, capabilities: XcresulttoolCapabilities): Promise<any> {
  let command: string[];

  if (capabilities.commandFormat === 'modern' && capabilities.supportsGetTestResults) {
    // Xcode 16+ format - use test-results (LATEST FORMAT)
    command = ['xcrun', 'xcresulttool', 'get', 'test-results', '--path', bundlePath, '--format', 'json'];
  } else if (capabilities.commandFormat === 'legacy' && capabilities.supportsGetObject) {
    // Xcode 15.x format - first try without --legacy flag
    command = ['xcrun', 'xcresulttool', 'get', 'object', '--path', bundlePath, '--format', 'json'];
  } else if (capabilities.commandFormat === 'basic') {
    // Older format - use get directly
    command = ['xcrun', 'xcresulttool', 'get', '--path', bundlePath, '--format', 'json'];
  } else {
    throw new Error(`Unsupported xcresulttool format: ${capabilities.commandFormat}`);
  }

  try {
    const { stdout } = await execa(command[0], command.slice(1));
    
    // Fix malformed JSON with unescaped newlines
    const fixedJsonString = stdout.replace(
      /"Human-readable duration with optional\ncomponents of days, hours, minutes and seconds"/g,
      '"Human-readable duration with optional\\ncomponents of days, hours, minutes and seconds"'
    );
    
    return JSON.parse(fixedJsonString);
  } catch (error) {
    throw new Error(`Failed to get xcresult data: ${error instanceof Error ? error.message : String(error)}`);
  }
}