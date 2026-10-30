import base from './jest.base.config.ts';

export default {
  ...base,
  displayName: 'matter-sidecar',
  // The CRAP score run reuses this config but also executes the process-spawning specs.
  testTimeout: 60_000,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$', '\\.built\\.spec\\.ts$'],
  coverageDirectory: '../../coverage/apps/matter-sidecar',
};
