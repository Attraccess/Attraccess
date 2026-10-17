module.exports = {
  displayName: 'plugin-wago',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // Frontend specs run through the Vitest target which this target depends on.
  // Loading them here compiles Vitest's ESM-only helpers through Jest's CJS runtime.
  testMatch: ['<rootDir>/backend/**/*.spec.ts'],
  // Several backend specs launch many shell processes; cap Jest's workers so
  // the process-heavy fixtures do not exhaust the host during Nx validation.
  maxWorkers: 2,
  transform: { '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }] },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  moduleNameMapper: {
    '^@attraccess/plugins-backend-sdk/v2$': '<rootDir>/../../../libs/plugins-backend-sdk/src/v2.ts',
    '^@attraccess/plugins-backend-sdk/adapter$': '<rootDir>/../../../libs/plugins-backend-sdk/src/adapter.ts',
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
};
