export default {
  displayName: 'plugin-matter',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/package/'],
  testMatch: ['<rootDir>/backend/**/*.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  coverageDirectory: '../../../coverage/apps/plugins/matter',
};
