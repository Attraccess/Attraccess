// Shared by the unit, integration and built-bundle configs, which differ only in which specs they match.
export default {
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
    // matter.js depends on ESM-only packages (@noble, @scure) that Jest must compile to CommonJS.
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
  moduleNameMapper: { '^@attraccess/matter-contract$': '<rootDir>/../../libs/matter-contract/src/index.ts' },
};
