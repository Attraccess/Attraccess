module.exports = {
  displayName: 'plugin-shelly',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // Backend only — the frontend specs are jsdom/React and run under Vitest
  // (the `test-frontend` target).
  testMatch: ['<rootDir>/backend/**/*.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  moduleFileExtensions: ['ts', 'js'],
  // Plugin sources import the host SDK, which exists only as a workspace path
  // alias (no node_modules entry) — point Jest at the library sources.
  moduleNameMapper: {
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  coverageDirectory: '../../../coverage/apps/plugins/shelly',
};
