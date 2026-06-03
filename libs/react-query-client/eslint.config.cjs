const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  {
    ignores: ['src/lib/**/**'],
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}', '{projectRoot}/vite.config.{js,ts,mjs,mts}'],
          ignoredDependencies: ['@tanstack/react-query'],
        },
      ],
    },
    languageOptions: {
      parser: require('jsonc-eslint-parser'),
    },
  },
];
