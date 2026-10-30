const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'reliability',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/reliability/reliability.spec.ts'],
  // The whole scenario is one test that owns its broker and runs for minutes.
  testTimeout: 2 * 60 * 60_000,
};
