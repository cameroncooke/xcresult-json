# xcresult-json

> [!WARNING]
> This product is still in development and is likely not fully functional or tested.

[![CI](https://github.com/cameroncooke/xcresult-json/actions/workflows/ci.yml/badge.svg)](https://github.com/cameroncooke/xcresult-json/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/xcresult-json.svg)](https://badge.fury.io/js/xcresult-json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-ready CLI tool for extracting test results from Xcode `.xcresult` bundles and converting them to structured JSON format.

## Features

- 🚀 Fast extraction using Apple's official `xcresulttool`
- 📊 Hierarchical suite-grouped JSON output with detailed test information
- 🔍 Runtime JSON-Schema validation with forward compatibility
- 💾 Built-in LRU caching for improved performance
- 🎯 TypeScript types generated from official Apple schema
- 🛡️ Comprehensive error handling with meaningful exit codes
- ✅ Production-ready with >95% test coverage

## Installation

```bash
npm install -g xcresult-json
```

## Usage

### Basic Usage

```bash
xcresult-json --path /path/to/your.xcresult
```

### CLI Options

```bash
xcresult-json [options]

Options:
  --path <path>     Path to .xcresult bundle (required)
  --pretty          Pretty print JSON output
  --fail-fast       Exit immediately on first test failure
  --schema <type>   Schema type to extract (default: "tests")
  --version         Show version number
  --help            Show help
```

### Examples

Extract test results with pretty formatting:
```bash
xcresult-json --path ./DerivedData/Test.xcresult --pretty
```

Use in CI with fail-fast behavior:
```bash
xcresult-json --path ./test.xcresult --fail-fast
```

Extract and display the JSON schema:
```bash
xcresult-json --path ./test.xcresult --schema tests
```

## Output Format

The tool outputs a hierarchical JSON structure representing your test results:

```json
{
  "report": {
    "suites": [
      {
        "name": "MyTestSuite",
        "tests": {
          "passed": [
            {
              "name": "testExample",
              "duration": 0.123,
              "identifier": "MyTestSuite/testExample",
              "status": "Success"
            }
          ],
          "failed": [
            {
              "name": "testFailure",
              "duration": 0.456,
              "identifier": "MyTestSuite/testFailure",
              "status": "Failure",
              "failureMessage": "XCTAssertTrue failed - expected true but was false"
            }
          ]
        }
      }
    ],
    "summary": {
      "totalTests": 2,
      "passedTests": 1,
      "failedTests": 1,
      "totalDuration": 0.579
    }
  }
}
```

## Exit Codes

- `0` - All tests passed
- `10` - One or more tests failed (when using `--fail-fast`)
- `2` - Error occurred (invalid bundle, parsing error, etc.)
- `1` - xcresulttool not found (Xcode not installed)

## Requirements

- macOS with Xcode installed
- Node.js 16 or higher
- Xcode 15 or 16 (automatically detects capabilities)

## Programmatic Usage

You can also use xcresult-json as a library in your Node.js projects:

```typescript
import { parseXCResult } from 'xcresult-json';

try {
  const report = await parseXCResult('/path/to/your.xcresult');
  console.log(`Total tests: ${report.summary.totalTests}`);
  console.log(`Passed: ${report.summary.passedTests}`);
  console.log(`Failed: ${report.summary.failedTests}`);
} catch (error) {
  console.error('Failed to parse xcresult:', error);
}
```

## Performance

- **LRU Caching**: Minimizes repeated xcresulttool calls for the same data
- **Lazy Loading**: Test details are only fetched when needed
- **Efficient Processing**: Optimized for large result bundles

## Forward Compatibility

The tool validates JSON payloads against Apple's official schema but continues processing on validation failures with warnings. This ensures compatibility with future Xcode versions that may introduce schema changes.

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/xcresult-json.git
cd xcresult-json

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Run in development mode
npm run dev -- --path ./test.xcresult

# Generate TypeScript types from live schema
npm run build:types
```

### Project Structure

```
src/
├── index.ts       # CLI entry point
├── parser.ts      # Core parsing logic
├── xcjson.ts      # xcresulttool wrapper
├── schema.ts      # Schema fetching and type generation
├── validator.ts   # Runtime JSON validation
└── cache.ts       # LRU cache implementation
```

## Testing

The project maintains >95% test coverage:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm test -- --coverage

# Run specific test file
npm test parser.test.ts
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass with `npm test`
2. Coverage remains above 90% for statements/lines and 80% for branches
3. Code follows the existing style (ESLint + Prettier)
4. Commit messages are clear and descriptive

## Support

For issues and feature requests, please visit: https://github.com/yourusername/xcresult-json/issues
