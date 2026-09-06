const base = require('./test-wago-commissioning.config.cjs');
module.exports = {
  ...base,
  displayName: 'commissioning-browser-acceptance',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/commissioning-browser.spec.ts'],
};
