export default {
  displayName: 'matter-sidecar-built',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.built.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '^@attraccess/matter-contract$': '<rootDir>/../../libs/matter-contract/src/index.ts' },
  testTimeout: 60000,
};
