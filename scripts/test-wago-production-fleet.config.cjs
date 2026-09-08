module.exports = {
  displayName: 'production-fleet-fixture',
  rootDir: '..',
  testEnvironment: 'node',
  // Crawl source packages, not duplicate manifests restored in Nx/build artifacts.
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/production-fleet*.spec.ts'],
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
    '^@attraccess/(.*)$': '<rootDir>/libs/$1/src/index.ts',
    '^lodash-es$': 'lodash',
    '^@node-saml/passport-saml$': '<rootDir>/apps/api/src/test/mocks/node-saml-passport-saml.ts',
    '^mjml$': '<rootDir>/apps/api/src/test/mocks/mjml.ts',
  },
  testTimeout: 20_000,
};
