const config = require('./jest.config.ts');
const moduleNameMapper = { ...config.moduleNameMapper };
delete moduleNameMapper['^@node-saml/passport-saml$'];
module.exports = {
  ...config,
  displayName: 'api-logout-integration',
  moduleNameMapper,
  globalSetup: '<rootDir>/../../scripts/jest-docker-context.ts',
  testMatch: [
    '**/sso-session-store.integration.spec.ts',
    '**/oidc-logout.integration.spec.ts',
    '**/saml-logout.integration.spec.ts',
  ],
};
