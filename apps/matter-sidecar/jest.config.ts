import base from './jest.base.config.ts';

export default {
  ...base,
  displayName: 'matter-sidecar',
  testTimeout: 60_000,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$', '\\.built\\.spec\\.ts$'],
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../coverage/apps/matter-sidecar/test',
};
