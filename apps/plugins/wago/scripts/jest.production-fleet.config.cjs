const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'production-fleet-fixture',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/fleet/fleet.spec.ts'],
};
