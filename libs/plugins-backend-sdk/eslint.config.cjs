const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  // The SDK is lint-run from this folder, so the plugin-code boundary of the root config is repeated for its sources.
  ...baseConfig.pluginStorageBoundaryConfig(['src/**/*.ts']),
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
        },
      ],
    },
    languageOptions: {
      parser: require('jsonc-eslint-parser'),
    },
  },
];
