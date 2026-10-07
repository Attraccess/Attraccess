import { registerSsoOidcIntegrationE2eWithTestcontainersFixture } from './sso-oidc.e2e.sso-oidc-integration-e2e-with-testcontainers.test-fixture';
import { registerCreatesANewUserOnFirstOidcLoginCases } from './sso-oidc.e2e.sso-oidc-integration-e2e-with-testcontainers.correctly-syncs-sso-roles-when-permission-mappings-are-configured.behaviors.test-cases';
import { registerReturnsTheSameUserOnRepeatOidcLoginsSsoSubjectDeduplicationCases } from './sso-oidc.e2e.sso-oidc-integration-e2e-with-testcontainers.correctly-syncs-sso-roles-when-permission-mappings-are-configured.behaviors.test-cases';
import { registerCreatesSeparateUsersForDifferentOidcProvidersProviderIsolationCases } from './sso-oidc.e2e.sso-oidc-integration-e2e-with-testcontainers.correctly-syncs-sso-roles-when-permission-mappings-are-configured.behaviors.test-cases';
import { registerCorrectlySyncsSsoRolesWhenPermissionMappingsAreConfiguredCases } from './sso-oidc.e2e.sso-oidc-integration-e2e-with-testcontainers.correctly-syncs-sso-roles-when-permission-mappings-are-configured.behaviors.test-cases';
describe('SSO OIDC integration (e2e with testcontainers)', () => {
  const fixture = registerSsoOidcIntegrationE2eWithTestcontainersFixture();
  registerCreatesANewUserOnFirstOidcLoginCases(fixture);
  registerReturnsTheSameUserOnRepeatOidcLoginsSsoSubjectDeduplicationCases(fixture);
  registerCreatesSeparateUsersForDifferentOidcProvidersProviderIsolationCases(fixture);
  registerCorrectlySyncsSsoRolesWhenPermissionMappingsAreConfiguredCases(fixture);
});
