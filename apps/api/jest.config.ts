module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // Direct Jest callers (including CRAP coverage) must keep native workflows opt-in too.
  testMatch: ['**/*.spec.ts', '!**/*.real-api.spec.ts', '!**/*.alerting.spec.ts', '!**/*.browser.spec.ts'],
  setupFiles: ['<rootDir>/src/test/jest.setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  // ESM-only packages (Nest, JOSE, @scure/@noble, …) load natively: the Nx test targets run Jest with
  // NODE_OPTIONS=--experimental-vm-modules, which enables Jest's require(esm) support.
  // json: nestjs-asyncapi's dependency chain requires spdx-license-ids, whose entry point is index.json.
  moduleFileExtensions: ['ts', 'js', 'json', 'html'],
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../coverage/apps/api/test',
  // Database integration tests and bcrypt exceed their per-test timeouts under the default worker count.
  maxWorkers: 3,
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
    '^@node-saml/passport-saml$': '<rootDir>/src/test/mocks/node-saml-passport-saml.ts',
    '^mjml$': '<rootDir>/src/test/mocks/mjml.ts',
  },
};
