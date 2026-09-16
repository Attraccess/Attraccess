const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'commissioning-acceptance',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/commissioning.spec.ts'],
};
