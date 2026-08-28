module.exports = {
  displayName: 'plugin-wago',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/backend/**/*.spec.ts'],
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }] },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: { '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts' },
};
