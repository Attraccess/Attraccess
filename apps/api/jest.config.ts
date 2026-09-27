module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test/jest.setup.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  // Keep API tests within the memory budget when Nx runs multiple project targets concurrently.
  maxWorkers: 2,
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
    '^@node-saml/passport-saml$': '<rootDir>/src/test/mocks/node-saml-passport-saml.ts',
    '^mjml$': '<rootDir>/src/test/mocks/mjml.ts',
  },
};
