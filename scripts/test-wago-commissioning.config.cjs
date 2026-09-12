const base = require('./test-wago-production-fleet.config.cjs');
module.exports = {
  ...base,
  displayName: 'commissioning-acceptance',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/commissioning.spec.ts'],
};
