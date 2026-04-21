const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.js'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
];
