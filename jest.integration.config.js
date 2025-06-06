export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/integration/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
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
  // Integration tests can take longer and work with real files
  testTimeout: 120000,
  // Don't collect coverage for integration tests - they test the public API
  collectCoverage: false,
};