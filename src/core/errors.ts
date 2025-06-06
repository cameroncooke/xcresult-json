/**
 * Core error types for xcresult parsing
 */

export class XCResultError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'XCResultError';
  }

  static invalidBundle(path: string): XCResultError {
    return new XCResultError(`Invalid xcresult bundle: ${path}`, 'INVALID_BUNDLE');
  }

  static xcresulttoolNotFound(): XCResultError {
    return new XCResultError(
      'xcresulttool not found. Ensure Xcode is installed.',
      'XCRESULTTOOL_NOT_FOUND'
    );
  }

  static xcresulttoolFailed(error: Error): XCResultError {
    return new XCResultError(
      `xcresulttool execution failed: ${error.message}`,
      'XCRESULTTOOL_FAILED',
      error
    );
  }

  static unsupportedFormat(): XCResultError {
    return new XCResultError(
      'Unsupported xcresult format. No parser could handle the data.',
      'UNSUPPORTED_FORMAT'
    );
  }
}
