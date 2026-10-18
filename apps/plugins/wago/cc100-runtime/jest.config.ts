module.exports = {
  displayName: 'wago-cc100-runtime',
  preset: '../../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  // Runtime integration tests spawn MQTT and shell helper processes; keep
  // Jest from multiplying those subprocesses across the host's CPU count.
  maxWorkers: 1,
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../../../coverage/apps/wago-cc100-runtime',
};
