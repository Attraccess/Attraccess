module.exports = {
  ...require('./jest.config.ts'),
  displayName: 'api-browser',
  setupFiles: ['<rootDir>/src/test/desktop-real-api.test-fixture.ts'],
  testMatch: ['<rootDir>/src/e2e/**/*.browser.spec.ts'],
  testTimeout: 120_000,
};
