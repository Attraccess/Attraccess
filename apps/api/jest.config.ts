module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/../../scripts/jest-docker-context.ts', '<rootDir>/src/test/jest.setup.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
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
