import base from './jest.base.config.ts';

export default {
  ...base,
  displayName: 'matter-sidecar-built',
  testMatch: ['<rootDir>/src/**/*.built.spec.ts'],
  testTimeout: 90_000,
};
