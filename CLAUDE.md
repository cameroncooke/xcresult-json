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

This is a CLI tool that extracts test results from Xcode `.xcresult` bundles into structured JSON. The architecture follows a modular design:

### Core Flow
1. **CLI Entry** (`src/index.ts`) → Parses arguments with yargs
2. **XCJson Wrapper** (`src/xcjson.ts`) → Executes `xcresulttool` and caches results
3. **Parser** (`src/parser.ts`) → Transforms raw data into structured `Report` format
4. **Validator** (`src/validator.ts`) → Validates JSON against Apple's schema (warnings only)
5. **Output** → Returns JSON with proper exit codes (0=success, 10=test failures)

### Key Architectural Decisions

- **In-Memory Caching**: The `xcjson.ts` module caches xcresulttool responses to avoid repeated expensive subprocess calls
- **Forward Compatibility**: Validation failures only warn, don't stop execution (Apple's schema evolves)
- **Type Safety**: Exports clean TypeScript types (`TestResult`, `SuiteResult`, `Report`) for programmatic use
- **Error Handling**: Custom `XcjsonError` class with specific error codes for different failure modes
- **Platform Detection**: Automatically detects Xcode version and adjusts command format

### Important Implementation Details

- The parser recursively processes test hierarchies (tests can have subtests)
- Test details are fetched lazily only when failures exist
- Exit codes communicate test results to CI/CD systems
- The schema can be cached locally for offline development
- All async operations use proper error handling with try/catch

### Testing Approach

- Tests use Jest with ts-jest for TypeScript support
- Coverage thresholds: 90% lines/statements, 80% branches/functions
- Test fixtures in `test/fixtures/` contain sample xcresult JSON data
- The `test/setup.ts` file configures the test environment

### Build Process

Uses tsup (esbuild) to create a single minified CommonJS bundle with:
- Source maps for debugging
- Node.js shims for compatibility
- Target: Node.js 18+
- Output: `dist/index.js` with type definitions