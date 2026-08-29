module.exports = {
  displayName: 'wago-cc100-runtime',
  preset: '../../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../../../coverage/apps/wago-cc100-runtime',
};
