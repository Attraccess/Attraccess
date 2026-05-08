const nx = require('@nx/eslint-plugin');
const baseConfig = require('../../eslint.config.cjs');

const reactCompilerRulesAsWarn = {
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
  'react-hooks/static-components': 'off',
  'react-hooks/use-memo': 'off',
  'react-hooks/incompatible-library': 'off',
  'react-hooks/globals': 'off',
  'react-hooks/error-boundaries': 'off',
  'react-hooks/set-state-in-render': 'off',
  'react-hooks/unsupported-syntax': 'off',
  'react-hooks/config': 'off',
  'react-hooks/gating': 'off',
};

module.exports = [
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug', 'trace'] }],
      ...reactCompilerRulesAsWarn,
    },
  },
];
