module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // Direct Jest callers (including CRAP coverage) must keep native workflows opt-in too.
  testMatch: ['**/*.spec.ts', '!**/*.real-api.spec.ts', '!**/*.alerting.spec.ts'],
  setupFiles: ['<rootDir>/src/test/jest.setup.ts'],
  transform: {
    '^.+\\.js$': '<rootDir>/src/test/jose-transformer.cjs',
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  // ESM-only packages: JOSE, and otplib's @scure/@noble dependencies (mass-introduction QR codes).
  transformIgnorePatterns: ['node_modules/(?!jose/|\\.pnpm/jose@|@scure/|\\.pnpm/@scure\\+|@noble/|\\.pnpm/@noble\\+)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  // SQLite integration tests and bcrypt exceed their per-test timeouts under the default worker count.
  maxWorkers: 3,
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
    '^@node-saml/passport-saml$': '<rootDir>/src/test/mocks/node-saml-passport-saml.ts',
    '^mjml$': '<rootDir>/src/test/mocks/mjml.ts',
  },
};
