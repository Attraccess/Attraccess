module.exports = {
  displayName: 'plugin-wago',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // The CRAP coverage run instruments maintained modules and spawns isolated
  // shell fixtures, so use the same bounded test window as the acceptance suites.
  testTimeout: 20_000,
  // Frontend specs run through the Vitest target which this target depends on.
  // Loading them here compiles Vitest's ESM-only helpers through Jest's CJS runtime.
  testMatch: ['<rootDir>/backend/**/*.spec.ts'],
  transform: { '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }] },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  moduleNameMapper: { '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts' },
};
