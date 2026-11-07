module.exports = {
  displayName: 'config-ui',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/modules/*.spec.js', '<rootDir>/server.spec.js'],
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../coverage/tools/config-ui/test',
};
