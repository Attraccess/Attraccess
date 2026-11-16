const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'reliability-plan',
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '<rootDir>/coverage/apps/plugins/wago/test-reliability-plan',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/reliability/plan.spec.ts'],
};
