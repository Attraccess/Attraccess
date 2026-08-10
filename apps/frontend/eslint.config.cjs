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
    // Vendored, Emscripten-generated output (see tools/vendor-openscad.mjs). It is
    // not authored code and is not typechecked either; only the documented loader
    // patch at the top of the file is ours.
    ignores: ['public/openscad/openscad.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    ignores: ['**/*.json'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug', 'trace'] }],
      ...reactCompilerRulesAsWarn,
    },
  },
  {
    // Web worker entry points run outside a window: `self` is the legitimate global
    // (there is no `window`), not the confusing-browser-global that this rule guards
    // against in ordinary app code.
    files: ['**/*.worker.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
];
