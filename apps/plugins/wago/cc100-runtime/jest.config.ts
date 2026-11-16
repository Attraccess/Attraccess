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
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../../../coverage/apps/plugins/wago/test-cc100-runtime',
};
