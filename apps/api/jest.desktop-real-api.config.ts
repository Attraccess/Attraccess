module.exports = {
  ...require('./jest.config.ts'),
  displayName: 'desktop-real-api',
  setupFiles: ['<rootDir>/src/test/desktop-real-api.setup.ts'],
  testMatch: ['<rootDir>/src/e2e/desktop-simulator.real-api.spec.ts'],
};
