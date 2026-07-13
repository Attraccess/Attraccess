module.exports = {
  displayName: 'companion',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    // ponytail: ignoreCodes [2305] suppresses "no exported member" from @attraccess/companion-ws-client
    // which is a generated lib — types are absent when CI runs tests without the generate step first.
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', diagnostics: { ignoreCodes: [2305] } }],
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/apps/companion',
};
