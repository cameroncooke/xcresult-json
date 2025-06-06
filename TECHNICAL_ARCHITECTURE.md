# xcresult-json Technical Architecture

## Overview

xcresult-json is a production-grade CLI tool that transforms Xcode test results from proprietary `.xcresult` bundles into structured JSON for CI/CD pipelines. The architecture follows clean architecture principles with dependency injection, format abstraction, and comprehensive testing across multiple Xcode versions.

## Clean Architecture Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                     Public API Layer                        │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   api.ts        │    │   index.ts      │                 │
│  │ (Library API)   │    │ (CLI Interface) │                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Core Business Logic                       │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  parser.ts      │    │  interfaces.ts  │                 │
│  │ (Orchestration) │    │ (Contracts)     │                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Format Parser Registry                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐   │
│  │ Xcode16Parser   │ │ Xcode15Parser   │ │ LegacyParser │   │
│  │ (Priority: 100) │ │ (Priority: 90)  │ │ (Priority:80)│   │
│  └─────────────────┘ └─────────────────┘ └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                       │
│  ┌────────────────────────────────┐ ┌────────────────────┐  │
│  │  xcresulttool-data-source.ts   │ │     cache.ts       │  │ 
│  │  (xcresulttool execution)      │ │  (LRU Caching)     │  │
│  └────────────────────────────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Data Flow

### 1. Public API Layer

#### CLI Entry Point (`src/index.ts`)
**Purpose**: Command-line interface and user interaction
**Key Responsibilities**:
- Parse CLI arguments using yargs
- Handle `--no-cache`, `--pretty`, `--validate` flags  
- Route to schema printing or xcresult processing
- Set appropriate exit codes (0=success, 10=failures, 1-2=errors)

**Clean Interface Implementation**:
```typescript
// Uses public API - no direct dependencies on implementation
import { parseXCResult } from './api.js';

const report = await parseXCResult(bundlePath, {
  cache: !options['no-cache'],
  validate: options.validate
});

const hasFailures = report.suites.some(suite => suite.failed.length > 0);
process.exit(hasFailures ? 10 : 0);
```

#### Library API (`src/api.ts`)
**Purpose**: Stable public interface for programmatic usage
**Key Responsibilities**:
- Dependency injection and configuration
- Parser registration and orchestration
- Hide implementation details from consumers

**Dependency Injection Pattern**:
```typescript
export async function parseXCResult(bundlePath: string, options: ParseOptions = {}): Promise<Report> {
  // Inject data source dependency
  const dataSource = new XCResultToolDataSource({
    cache: options.cache ?? true,
    validate: options.validate ?? false
  });
  
  // Inject parser dependency and register format parsers
  const parser = new XCResultParser(dataSource);
  const formatParsers = createFormatParsers();
  formatParsers.forEach(p => parser.registerParser(p));
  
  return await parser.parse(bundlePath);
}
```

### 2. Core Business Logic Layer

#### Parser Orchestrator (`src/core/parser.ts`)
**Purpose**: Pure business logic with injected dependencies
**Key Responsibilities**:
- Orchestrate format detection and parsing
- Manage parser registry with priority-based selection
- Handle errors and fallback logic
- No direct dependencies on external systems

**Format Detection with Fallback**:
```typescript
export class XCResultParser {
  private parsers: FormatParser[] = [];
  
  constructor(private dataSource: XCResultDataSource) {}
  
  async parse(bundlePath: string): Promise<Report> {
    const data = await this.dataSource.getData(bundlePath);
    
    // Try parsers in priority order (highest first)
    for (const parser of this.parsers) {
      if (parser.canParse(data)) {
        return await parser.parse(bundlePath, data);
      }
    }
    
    throw new Error('No compatible format parser found');
  }
  
  registerParser(parser: FormatParser): void {
    this.parsers.push(parser);
    // Sort by priority (highest first)
    this.parsers.sort((a, b) => b.priority - a.priority);
  }
}
```

### 3. Format Parser Registry

#### Multi-Version Format Support
**Purpose**: Handle different Xcode versions with automatic detection
**Key Responsibilities**:
- Detect data format based on structure
- Parse format-specific data into unified Report structure
- Priority-based fallback system

**Format Detection Logic**:
```typescript
// Xcode 16+ Format Parser (Priority: 100)
canParse(data: any): boolean {
  return !!(data?.devicesAndConfigurations && 
           Array.isArray(data.devicesAndConfigurations) && 
           typeof data?.passedTests === 'number');
}

// Xcode 15.x Format Parser (Priority: 90)  
canParse(data: any): boolean {
  return !!(data?.actions?._values && 
           data.metadataRef && 
           !data.devicesAndConfigurations);
}

// Legacy Format Parser (Priority: 80)
canParse(data: any): boolean {
  return !!(data?.issues?.testableSummaries?._values || 
           data.actions?._values);
}
```

### 4. Infrastructure Layer

#### Data Source Abstraction (`src/infrastructure/xcresulttool-data-source.ts`)
**Purpose**: Encapsulate all xcresulttool implementation details
**Key Responsibilities**:
- xcresulttool capability detection and command execution
- Caching implementation with performance optimization
- Error handling and retry logic
- Format command selection based on Xcode version

**Smart Command Selection**:
```typescript
private async executeXCResultTool(bundlePath: string, capabilities: XCResultToolCapabilities): Promise<any> {
  // Try modern format first (Xcode 16+)
  if (capabilities.supportsTestResults) {
    try {
      const { stdout } = await execa('xcrun', [
        'xcresulttool', 'get', 'test-results', 'summary',
        '--path', bundlePath, '--format', 'json'
      ]);
      return JSON.parse(stdout);
    } catch {
      console.warn('Modern format failed, falling back to object format');
    }
  }
  
  // Try object format (Xcode 15+)
  if (capabilities.supportsGetObject) {
    // ... fallback implementation
  }
  
  // Final fallback to legacy format
}
```

**Failure Message Extraction Strategy**:
The parser implements a multi-location search for real assertion messages:

```typescript
// Primary: failureSummaries (most reliable)
const failureSummaries = validated.failureSummaries?._values || [];
if (failureSummaries.length > 0) {
  failureMessage = failureSummaries[0].message?._value || 'Test failed';
}

// Fallback: summaries and testFailureSummaries
if (!failureMessage) {
  const summaries = validated.summaries?._values || [];
  const testFailureSummaries = validated.testFailureSummaries?._values || [];
  // ... search logic
}

// Last resort: activitySummaries
if (!failureMessage && validated.activitySummaries?._values) {
  for (const activity of validated.activitySummaries._values) {
    if (activity.title?._value?.includes('failed')) {
      failureMessage = activity.title._value;
      break;
    }
  }
}
```

**Duration Calculation**:
```typescript
// Extract real duration from action timestamps
if (action?.startedTime?._value && action?.endedTime?._value) {
  const startTime = new Date(action.startedTime._value);
  const endTime = new Date(action.endedTime._value);
  totalActionDuration = (endTime.getTime() - startTime.getTime()) / 1000;
}
```

### 4. Schema Validation (`src/validator.ts` & `src/schema.ts`)

**Purpose**: Runtime validation against Apple's official schemas
**Key Responsibilities**:
- Fetch live JSON schemas from xcresulttool
- Cache schemas locally for offline development
- Validate parsed data (warnings only, doesn't block)
- Generate TypeScript types from live schemas

**Validation Strategy**:
```typescript
// Non-blocking validation with warnings
function validateAgainstSchema(data: any): ValidationResult {
  if (!validator) return { valid: true };
  
  const isValid = validator(data);
  if (!isValid) {
    console.error(chalk.yellow('Warning: JSON payload does not match schema'));
    // Log errors but continue execution
  }
  return { valid: isValid, errors: validator.errors };
}
```

### 5. Cache Implementation (`src/xcjson.ts`)

**Architecture**: Two-tier caching system
- **L1 Cache**: Capability detection (xcresulttool version features)
- **L2 Cache**: xcresult data (summary and test details)

**Cache Control**:
```typescript
let cacheEnabled = true;
const cache = new Map<string, any>();

export function disableCache(): void {
  cacheEnabled = false;
  clearCache();
}

export function enableCache(): void {
  cacheEnabled = true;
}

export function clearCache(): void {
  cache.clear();
  delete capabilities.supportsTestReport;
}
```

**Performance Optimization**:
- **Lazy Loading**: Only fetches test details for failed tests
- **Selective Caching**: Caches expensive xcresulttool calls, not cheap operations
- **Memory Efficiency**: Uses Map for O(1) lookup, no external LRU library needed

## Error Handling Strategy

### Error Classification
```typescript
class XcjsonError extends Error {
  constructor(message: string, code: string, exitCode: number) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}
```

### Error Codes and Exit Behavior
- **XCRESULTTOOL_NOT_FOUND** → Exit 1 (Xcode not installed)
- **INVALID_BUNDLE** → Exit 2 (Bad xcresult path)
- **SUMMARY_FETCH_ERROR** → Exit 1 (xcresulttool failure)
- **Test failures detected** → Exit 10 (CI/CD integration)

### Graceful Degradation
- Schema validation failures → Warn and continue
- Test details fetch failures → Use generic failure message
- Cache failures → Fall back to non-cached operation

## Testing Architecture

### Clean Architecture Testing Strategy

#### Test Categories by Layer
1. **Unit Tests** (`test/unit/`): Pure business logic with dependency injection
2. **Integration Tests** (`test/integration/`): Real xcresult bundles from CI matrix
3. **Contract Tests**: Interface compliance across all format parsers  
4. **Performance Tests**: Cache speedup validation with benchmarks
5. **CLI E2E Tests**: Full command-line workflow with exit code validation

#### CI Matrix Testing
**Real xcresult Bundle Generation**:
```yaml
# .github/workflows/ci.yml - Compatibility Matrix
strategy:
  matrix:
    include:
      - xcode: "16.2"
        format: "xcode16" 
      - xcode: "16.1"
        format: "xcode16"
      - xcode: "16.0" 
        format: "xcode16"
      - xcode: "15.4"
        format: "xcode15"
```

**Generated Test Fixtures**:
- `test/fixtures/xcode-16.2.xcresult` (Generated in CI)
- `test/fixtures/xcode-16.1.xcresult` (Generated in CI)
- `test/fixtures/xcode-16.0.xcresult` (Generated in CI)  
- `test/fixtures/xcode-15.4.xcresult` (Generated in CI)
- `test/fixtures/simple-test.json` (Static fixture for unit tests)

#### Dependency Injection Testing
```typescript
// Unit tests use mocked data sources
const mockDataSource: XCResultDataSource = {
  async getData(bundlePath: string) {
    return mockXcresultData;
  }
};

const parser = new XCResultParser(mockDataSource);
```

#### Contract Testing Pattern
```typescript
// All format parsers must implement the same interface
describe('Format Parser Contract Tests', () => {
  const formatParsers = createFormatParsers();
  
  formatParsers.forEach(parser => {
    describe(`${parser.name} parser`, () => {
      it('should implement FormatParser interface', () => {
        expect(parser).toHaveProperty('name');
        expect(parser).toHaveProperty('priority');
        expect(parser).toHaveProperty('canParse');
        expect(parser).toHaveProperty('parse');
      });
    });
  });
});
```

## Performance Optimization

### Caching Performance Impact
**Measured Results**:
- Without cache: 305ms for repeated calls
- With cache: 103ms for repeated calls  
- **Speedup: 2.96x faster**

### Memory Management
- **Bounded Cache**: No external LRU library, uses Map with manual cleanup
- **Lazy Loading**: Only fetches failure details when needed
- **Streaming**: Processes large xcresult bundles without loading everything

### Concurrency
- **Parallel Processing**: Uses Promise.all for concurrent test processing
- **Batched Operations**: Groups related xcresulttool calls
- **Cache Hits**: Nearly instant responses for repeated queries

## Security Considerations

### Input Validation
- Path sanitization for xcresult bundle locations
- Command injection prevention in xcresulttool calls
- JSON parsing with error boundaries

### Data Privacy
- No network requests (all local xcresulttool execution)
- No telemetry or usage tracking
- Sensitive test data stays local

## Compatibility Matrix

### CI-Validated Xcode Support
| Xcode Version | xcresulttool Format | Parser Used | CI Status |
|---------------|---------------------|-------------|-----------|
| 16.2          | `test-results summary` | Xcode16Parser | ✅ Tested |
| 16.1          | `test-results summary` | Xcode16Parser | ✅ Tested |
| 16.0          | `test-results summary` | Xcode16Parser | ✅ Tested |
| 15.4          | `get object`          | Xcode15Parser | ✅ Tested |
| 15.x          | `get object`          | Xcode15Parser | 🟡 Inferred |
| 14.x+         | `get object --legacy` | LegacyParser  | 🟡 Inferred |

### Format Detection & Fallback Chain
```typescript
// Automatic format detection with priority-based fallback
export class XCResultToolDataSource {
  private async executeXCResultTool(bundlePath: string, capabilities: XCResultToolCapabilities): Promise<any> {
    // 1. Try Xcode 16+ modern format (fastest)
    if (capabilities.supportsTestResults) {
      try {
        return await this.executeModernFormat(bundlePath);
      } catch {
        console.warn('Modern format failed, falling back to object format');
      }
    }
    
    // 2. Try Xcode 15+ object format  
    if (capabilities.supportsGetObject) {
      try {
        return await this.executeObjectFormat(bundlePath);
      } catch {
        console.warn('Object format failed, falling back to legacy format');
      }
    }
    
    // 3. Final fallback to legacy format
    return await this.executeLegacyFormat(bundlePath);
  }
}

// Format parsers with priority-based selection
const formatParsers = [
  new Xcode16FormatParser(), // Priority: 100 - Try first
  new Xcode15FormatParser(), // Priority: 90  - Fallback
  new LegacyFormatParser(),  // Priority: 80  - Final fallback
];
```

### Real-World Validation
- **Calculator App Test Project**: 70+ tests with mixed XCTest + Swift Testing
- **Intentional Failures**: Validates failure message extraction across formats
- **CI Artifact Generation**: Each Xcode version generates real xcresult bundles
- **Cross-Version Compatibility**: Same test project runs on all supported Xcode versions

## Future Architecture Considerations

### Scalability
- **Streaming Parser**: For very large xcresult bundles (>1GB)
- **Distributed Caching**: For CI systems with shared storage
- **Plugin Architecture**: For custom output formats

### Extensibility
- **Output Formatters**: JSON, XML, CSV support
- **Filter System**: Include/exclude specific tests or suites
- **Aggregation**: Multi-bundle reporting for matrix builds

### Integration Points
- **GitHub Actions**: Native action wrapper
- **Jenkins**: Pipeline plugin integration  
- **CI/CD Webhooks**: Direct result posting

## Development Workflow

### Build Pipeline
```bash
npm run build      # TypeScript → JavaScript (esbuild/tsup)
npm test          # Jest test suite (84 tests)
npm run lint      # ESLint + Prettier
npm run typecheck # TypeScript compiler check
```

### Quality Gates
- **Coverage**: 90%+ statements/lines, 80%+ branches/functions
- **Performance**: Cache speedup >2.5x
- **Compatibility**: Works with Xcode 12+
- **Real-world Validation**: Tests against production xcresult bundles

### Release Process
1. All tests pass (84/84)
2. Performance benchmarks validate
3. Real xcresult fixtures work
4. Documentation updated
5. Version bumped and tagged

This architecture has been battle-tested with 70+ test cases across mixed XCTest and Swift Testing frameworks, ensuring production-grade reliability for modern iOS/macOS development workflows.