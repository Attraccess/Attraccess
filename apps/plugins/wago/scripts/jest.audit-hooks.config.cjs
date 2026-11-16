const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'audit-hooks-integration',
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '<rootDir>/coverage/apps/plugins/wago/e2e',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/audit/hooks.integration.spec.ts'],
};
