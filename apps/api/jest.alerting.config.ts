const config = require('./jest.config.ts');

module.exports = {
  ...config,
  // Only the unit suite writes the coverage the crap-score target reads.
  collectCoverage: false,
  displayName: 'api-alerting',
  globalSetup: '<rootDir>/../../scripts/jest-docker-context.ts',
  testMatch: ['**/*.alerting.spec.ts'],
  maxWorkers: 1,
  testTimeout: 900000,
};
