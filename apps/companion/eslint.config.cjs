const nx = require('@nx/eslint-plugin');
const { fixupConfigRules } = require('@eslint/compat');
const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  // eslint-plugin-react, jsx-a11y and import still call context methods ESLint 10 removed.
  ...fixupConfigRules(nx.configs['flat/react']),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug', 'trace'] }],
    },
  },
];
