import base from './jest.base.config.ts';

export default {
  ...base,
  displayName: 'matter-sidecar-built',
  testMatch: ['<rootDir>/src/**/*.built.spec.ts'],
  testTimeout: 90_000,
  // Coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../coverage/apps/matter-sidecar/test-built',
};
