# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Build the project (TypeScript → JavaScript bundle)
npm run build

# Run all tests
npm test

# Run a single test file
npm test -- test/parser.test.ts

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch

# Lint code
npm run lint

# Type check without building
npm run typecheck

# Generate TypeScript types from live xcresulttool schema
npm run build:types

# Test the CLI locally
node dist/index.js --path ./path/to/test.xcresult --pretty
```

## Architecture Overview

This is a production-ready CLI tool that extracts test results from Xcode `.xcresult` bundles into structured JSON with comprehensive failure message extraction. The architecture follows a modular design optimized for real-world usage:

### Core Flow
1. **CLI Entry** (`src/index.ts`) → Parses arguments with yargs, handles customer-facing interface
2. **XCJson Wrapper** (`src/xcjson.ts`) → Executes `xcresulttool` with capability detection and result caching
3. **Parser** (`src/parser.ts`) → Transforms raw data into structured `Report` format with failure message extraction
4. **Validator** (`src/validator.ts`) → Optional JSON validation against Apple's schema (disabled by default)
5. **Output** → Returns clean JSON with proper exit codes (0=success, 10=test failures)

### Key Architectural Decisions

- **Legacy Format Priority**: Uses legacy xcresulttool format to access detailed failure messages and timing data
- **Smart Caching**: The `xcjson.ts` module caches xcresulttool responses to avoid repeated expensive subprocess calls
- **Failure Message Extraction**: Parses `failureSummaries` from test details to get actual assertion messages
- **Real Timing Data**: Calculates total duration from action start/end times for accurate performance metrics
- **Clean Output Format**: Removed placeholder fields (file/line) to provide professional JSON output
- **Type Safety**: Exports clean TypeScript types (`TestResult`, `SuiteResult`, `Report`) for programmatic use
- **Error Handling**: Custom `XcjsonError` class with specific error codes for different failure modes
- **Multi-Framework Support**: Handles both XCTest and Swift Testing in the same test run

### Important Implementation Details

- The parser uses legacy format by default to access detailed test information and failure messages
- Test failure details are fetched using individual summary reference IDs to get assertion messages
- Total duration is calculated from action-level timing metadata for accuracy
- Exit codes communicate test results to CI/CD systems (0=pass, 10=failures, 2=invalid bundle)
- Schema validation is optional (--validate flag) to avoid noise in production usage
- All async operations use proper error handling with try/catch

### Testing Approach

- Tests use Jest with ts-jest for TypeScript support
- Comprehensive test coverage with real-world validation
- Test fixtures include actual xcresult bundles with mixed XCTest and Swift Testing scenarios
- Integration tests verify failure message extraction and timing accuracy
- The `test/setup.ts` file configures the test environment
- Example project (`example_project/`) contains a calculator app with 70+ tests for realistic testing

### Build Process

Uses tsup (esbuild) to create a single minified CommonJS bundle with:
- Source maps for debugging
- Node.js shims for compatibility
- Target: Node.js 18+
- Output: `dist/index.js` with type definitions