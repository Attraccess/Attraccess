import base from './jest.base.config.ts';

export default {
  ...base,
  displayName: 'matter-sidecar-integration',
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  testTimeout: 30_000,
};
