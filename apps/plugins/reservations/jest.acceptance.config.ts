// Acceptance specs compose the plugin with real host services (see eslint.config.cjs: module
// boundaries are relaxed for apps/plugins/*/acceptance only). No coverage: the host code they load
// must not count towards the plugin's crap score.
module.exports = {
  displayName: 'plugin-reservations-acceptance',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/acceptance/**/*.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
};
