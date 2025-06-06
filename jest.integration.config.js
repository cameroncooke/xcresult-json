export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/integration.test.ts', '**/cli.test.ts'],
  // No setup file for integration tests - we want real dependencies
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/types/**',
    '!src/index.ts',
  ],
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