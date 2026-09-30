module.exports = {
  ...require('./jest.acceptance-base.config.cjs'),
  displayName: 'credential-rotation-fixture',
  testMatch: ['<rootDir>/apps/plugins/wago/acceptance/credential-rotation-mqtt.spec.ts'],
};
