module.exports = {
  ...require('./jest.config.ts'),
  // Only the unit suite writes the coverage the crap-score target reads.
  collectCoverage: false,
  displayName: 'api-browser',
  setupFiles: ['<rootDir>/src/test/desktop-real-api.test-fixture.ts'],
  testMatch: ['<rootDir>/src/e2e/**/*.browser.spec.ts'],
  testTimeout: 120_000,
};
