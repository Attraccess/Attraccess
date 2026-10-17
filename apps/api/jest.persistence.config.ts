const base = require('./jest.config.ts');
module.exports = {
  ...base,
  displayName: 'api-persistence',
  testMatch: ['<rootDir>/src/database/conformance/persistence.spec.ts'],
  maxWorkers: 1,
  testTimeout: 30_000,
  coverageDirectory: '../../coverage/apps/api-persistence',
};
