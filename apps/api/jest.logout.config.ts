const config = require('./jest.config.ts');
const moduleNameMapper = { ...config.moduleNameMapper };
delete moduleNameMapper['^@node-saml/passport-saml$'];
module.exports = {
  ...config,
  // Only the unit suite writes the coverage the crap-score target reads.
  collectCoverage: false,
  displayName: 'api-logout-integration',
  moduleNameMapper,
  globalSetup: '<rootDir>/../../scripts/jest-docker-context.ts',
  testMatch: [
    '**/sso-session-store.integration.spec.ts',
    '**/oidc-logout.integration.spec.ts',
    '**/saml-logout.integration.spec.ts',
  ],
};
