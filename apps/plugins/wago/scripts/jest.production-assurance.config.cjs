const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'production-assurance-software',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/assurance/*.spec.ts'],
  testTimeout: 86_580_000,
};
