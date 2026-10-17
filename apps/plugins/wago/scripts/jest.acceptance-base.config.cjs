// Shared base for the WAGO acceptance jest configs. rootDir is the workspace root
// so specs can compose host (apps/api) and plugin sources.
module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  // Crawl source packages, not duplicate manifests restored in Nx/build artifacts.
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  modulePathIgnorePatterns: [
    '<rootDir>/(?:[.]nx|dist|build|output|coverage)/',
    '<rootDir>/apps/plugins/[^/]+/package/',
  ],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/apps/plugins/wago/acceptance/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@attraccess/plugins-backend-sdk/v2$': '<rootDir>/libs/plugins-backend-sdk/src/v2.ts',
    '^@attraccess/plugins-backend-sdk/adapter$': '<rootDir>/libs/plugins-backend-sdk/src/adapter.ts',
    '^@attraccess/(.*)$': '<rootDir>/libs/$1/src/index.ts',
    '^lodash-es$': 'lodash',
    '^@node-saml/passport-saml$': '<rootDir>/apps/api/src/test/mocks/node-saml-passport-saml.ts',
    '^mjml$': '<rootDir>/apps/api/src/test/mocks/mjml.ts',
  },
  testTimeout: 20_000,
};
