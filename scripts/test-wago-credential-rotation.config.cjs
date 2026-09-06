module.exports = {
  ...require('./test-wago-production-fleet.config.cjs'),
  displayName: 'credential-rotation-fixture',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/credential-rotation-mqtt.spec.ts'],
};
