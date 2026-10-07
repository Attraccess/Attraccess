import { registerPasswordPolicyOnRemainingEndpointsIntegrationFixture } from './change-password-flow.integration.password-policy-on-remaining-endpoints-integration.test-fixture';
import { registerPostUsersIdPasswordSetUserPasswordCases } from './change-password-flow.integration.password-policy-on-remaining-endpoints-integration.logging-hygiene.behaviors.test-cases';
import { registerPostUsersUserIdChangePasswordByTokenCases } from './change-password-flow.integration.password-policy-on-remaining-endpoints-integration.logging-hygiene.behaviors.test-cases';
import { registerPostUsersAcceptInvitationCases } from './change-password-flow.integration.password-policy-on-remaining-endpoints-integration.logging-hygiene.behaviors.test-cases';
import { registerLoggingHygieneCases } from './change-password-flow.integration.password-policy-on-remaining-endpoints-integration.logging-hygiene.behaviors.test-cases';
describe('Password policy on remaining endpoints (integration)', () => {
  const fixture = registerPasswordPolicyOnRemainingEndpointsIntegrationFixture();
  registerPostUsersIdPasswordSetUserPasswordCases(fixture);
  registerPostUsersUserIdChangePasswordByTokenCases(fixture);
  registerPostUsersAcceptInvitationCases(fixture);
  registerLoggingHygieneCases(fixture);
});
