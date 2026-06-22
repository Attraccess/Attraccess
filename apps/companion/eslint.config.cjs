const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  ...baseConfig,
  {
    files: ['apps/companion/**/*.ts'],
    rules: {},
  },
];
