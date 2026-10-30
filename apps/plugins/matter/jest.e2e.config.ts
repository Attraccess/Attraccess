export default {
  displayName: 'plugin-matter-e2e',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/package/'],
  testMatch: ['<rootDir>/acceptance/**/*.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  testTimeout: 60000,
};
