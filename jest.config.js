export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/types/**',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 35, // Temporarily lowered during format abstraction development
      functions: 55, // Will be increased once all parsers are fully tested
      lines: 60,     // Current coverage is ~62%
      statements: 60,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          allowJs: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(execa|chalk|is-stream|merge-stream|npm-run-path|onetime|signal-exit|strip-final-newline|human-signals|mimic-fn|get-stream|is-plain-obj|strip-ansi|ansi-regex)/)',
  ],
};