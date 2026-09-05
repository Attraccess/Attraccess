module.exports = {
  displayName: 'wago-simulator-broker',
  rootDir: '../../../../..',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/apps/plugins/[^/]+/package/'],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  testMatch: ['<rootDir>/apps/plugins/wago/cc100-runtime/integration/*.integration.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/apps/plugins/wago/tsconfig.spec.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: { '^@attraccess/(.*)$': '<rootDir>/libs/$1/src/index.ts' },
  testTimeout: 20000,
};
