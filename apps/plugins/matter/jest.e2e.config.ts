export default {
  displayName: 'plugin-matter-e2e',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/package/'],
  testMatch: ['<rootDir>/acceptance/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
    // matter.js (loaded by the real sidecar) depends on ESM-only packages (@noble, @scure) that Jest must compile.
    '^.+\\.m?js$': [
      'ts-jest',
      {
        tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022', esModuleInterop: true },
        isolatedModules: true,
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(\\.pnpm/@(noble|scure)|@(noble|scure)))'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@attraccess/(.*)$': '<rootDir>/../../../libs/$1/src/index.ts',
  },
  testTimeout: 60000,
};
