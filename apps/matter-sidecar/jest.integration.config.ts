export default {
  displayName: 'matter-sidecar-integration',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '^@attraccess/matter-contract$': '<rootDir>/../../libs/matter-contract/src/index.ts' },
  testTimeout: 30000,
};
