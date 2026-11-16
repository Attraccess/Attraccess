const config = require('./jest.config.ts');

module.exports = {
  ...config,
  // Only the unit suite writes the coverage the crap-score target reads.
  collectCoverage: false,
  displayName: 'api-e2e',
  globalSetup: '<rootDir>/../../scripts/jest-docker-context.ts',
};
