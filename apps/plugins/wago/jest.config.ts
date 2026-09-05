module.exports = {
  displayName: 'plugin-wago',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  // This component suite runs in the frontend Vitest target.
  testPathIgnorePatterns: ['<rootDir>/frontend/src/ModbusConfigurationForm.spec.tsx'],
  testMatch: ['<rootDir>/backend/**/*.spec.ts', '<rootDir>/frontend/src/**/*.spec.tsx'],
  transform: { '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }] },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  moduleNameMapper: { '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts' },
};
