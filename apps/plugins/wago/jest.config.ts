module.exports = {
  displayName: 'plugin-wago',
  // Unit coverage feeds the project's crap-score target.
  collectCoverage: true,
  coverageReporters: ['json'],
  coverageDirectory: '../../../coverage/apps/plugins/wago/test',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // Frontend specs run through the Vitest target which this target depends on.
  // Loading them here compiles Vitest's ESM-only helpers through Jest's CJS runtime.
  testMatch: ['<rootDir>/backend/**/*.spec.ts'],
  // Several backend specs launch many shell processes; cap Jest's workers so
  // the process-heavy fixtures do not exhaust the host during Nx validation.
  transform: { '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }] },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  // Backend fixtures spawn shell and utility subprocesses; avoid multiplying
  // that fan-out across several Jest workers on constrained validation hosts.
  maxWorkers: 1,
  moduleNameMapper: { '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts' },
};
