const base = require('./jest.acceptance-base.config.cjs');
module.exports = {
  ...base,
  displayName: 'audit-hooks-integration',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/audit-hooks.integration.spec.ts'],
};
