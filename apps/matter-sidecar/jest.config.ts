export default {
  displayName: 'matter-sidecar',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // The CRAP score run reuses this config but also executes the process-spawning specs.
  testTimeout: 60_000,
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$', '\\.built\\.spec\\.ts$'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '^@attraccess/matter-contract$': '<rootDir>/../../libs/matter-contract/src/index.ts' },
  coverageDirectory: '../../coverage/apps/matter-sidecar',
};
