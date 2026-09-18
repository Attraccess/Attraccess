module.exports = {
  displayName: 'plugin-rabbitmq-e2e',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/../../../scripts/jest-docker-context.ts',
  testMatch: ['<rootDir>/backend/**/*.e2e.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  coverageDirectory: '../../../coverage/apps/plugins/rabbitmq-e2e',
};
