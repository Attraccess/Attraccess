const config = require('./jest.config.ts');

module.exports = {
  ...config,
  displayName: 'api-e2e',
  globalSetup: '<rootDir>/../../scripts/jest-docker-context.ts',
};
