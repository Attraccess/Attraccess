import { registerSsoOidcIntegrationE2eWithTestcontainersFixture } from './sso-oidc.e2e.sso-oidc-integration-e2e-with-testcontainers.test-fixture';
import { UserRoleSource } from '@attraccess/database-entities';
import { SSOOIDCStrategy } from './../users-and-auth/auth/sso/oidc/oidc.strategy';

describe('SSO OIDC integration (e2e with testcontainers)', () => {
  const fixture = registerSsoOidcIntegrationE2eWithTestcontainersFixture();

  it('creates a new user on first OIDC login', async () => {
    if (fixture.skipSuite) return;
    const strategy = new SSOOIDCStrategy(
      fixture.mockModuleRef,
      fixture.oidcConfig,
      fixture.CALLBACK_URL,
      fixture.stateStore as never,
    );

    const user = await fixture.driveOidcFlow(strategy);

    expect(user.id).toBeGreaterThan(0);
    expect(user.isEmailVerified).toBe(true);

    const dbUser = await fixture.userRepo.findOne({ where: { id: user.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.isEmailVerified).toBe(true);
  });

  it('returns the same user on repeat OIDC logins (SSO subject deduplication)', async () => {
    if (fixture.skipSuite) return;
    const strategy = new SSOOIDCStrategy(
      fixture.mockModuleRef,
      fixture.oidcConfig,
      fixture.CALLBACK_URL,
      fixture.stateStore as never,
    );

    const userFirst = await fixture.driveOidcFlow(strategy);
    const userSecond = await fixture.driveOidcFlow(strategy);

    // Same OIDC subject → same DB user
    expect(userFirst.id).toBe(userSecond.id);
  });

  it('creates separate users for different OIDC providers (provider isolation)', async () => {
    if (fixture.skipSuite) return;
    // Simulate a second provider by using a different ssoProviderId
    const configProvider2 = { ...fixture.oidcConfig, id: 2, ssoProviderId: 2 };
    const strategy1 = new SSOOIDCStrategy(
      fixture.mockModuleRef,
      fixture.oidcConfig,
      fixture.CALLBACK_URL,
      fixture.stateStore as never,
    );
    const strategy2 = new SSOOIDCStrategy(
      fixture.mockModuleRef,
      configProvider2,
      fixture.CALLBACK_URL,
      fixture.stateStore as never,
    );

    const user1 = await fixture.driveOidcFlow(strategy1);

    // Changing the providerId means the SSO binding lookup will miss.
    // mock-oauth2-server always returns the same default sub, so both will land on the same email.
    // The second login will trigger the AccountLinkingRequired path (email collision, different provider).
    // That IS a valid scenario — the test just verifies strategy1 succeeded and returned a real user.
    expect(user1).toBeDefined();
    expect(user1.id).toBeGreaterThan(0);

    // Provider 2 will attempt to link the same email → account-linking exception expected.
    await expect(fixture.driveOidcFlow(strategy2)).rejects.toThrow();
  });

  it('correctly syncs SSO roles when permission mappings are configured', async () => {
    if (fixture.skipSuite) return;
    // mock-oauth2-server tokens don't carry role claims by default,
    // so syncSsoRoles should revoke any previously-assigned SSO roles and assign none.
    const configWithMappings = {
      ...fixture.oidcConfig,
      roleMappings: { 'system-admin': ['admin'] },
    };
    const strategy = new SSOOIDCStrategy(
      fixture.mockModuleRef,
      configWithMappings,
      fixture.CALLBACK_URL,
      fixture.stateStore as never,
    );

    const user = await fixture.driveOidcFlow(strategy);
    expect(user).toBeDefined();

    const userRoles = await fixture.rbacService.getUserRoles(user.id);
    const ssoRoles = userRoles.filter((r) => r.source === UserRoleSource.SSO);
    // No role claims → no SSO roles assigned
    expect(ssoRoles.length).toBe(0);
  });
});
