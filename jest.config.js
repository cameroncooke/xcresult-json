export default {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts'],
      testEnvironment: 'node',
      roots: ['<rootDir>/test'],
      testMatch: ['**/unit/**/*.test.ts', '**/*test.ts'],
      testPathIgnorePatterns: ['/integration/'],
      setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/types/**',
        '!src/index.ts',
      ],
      coverageThreshold: {
        global: {
          branches: 85,  // Production-grade coverage
          functions: 90, // High function coverage for core components
          lines: 95,     // Target 95%+ line coverage
          statements: 95,
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
    }
  ]
};