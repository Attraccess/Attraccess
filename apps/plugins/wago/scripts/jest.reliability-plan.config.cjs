const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'reliability-plan',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/reliability/plan.spec.ts'],
};
