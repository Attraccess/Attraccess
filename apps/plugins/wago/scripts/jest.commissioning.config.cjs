const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'commissioning-acceptance',
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '<rootDir>/coverage/apps/plugins/wago/test-commissioning',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/commissioning/commissioning.spec.ts'],
};
