module.exports = {
  displayName: 'env',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../coverage/libs/env/test',
};
