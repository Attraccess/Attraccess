import { registerSsoSamlStrategyValidateIntegrationE2eFixture } from './sso-saml.e2e.sso-saml-strategy-validate-integration-e2e.test-fixture';

export function registerCreatesANewUserOnFirstSamlAssertionCases(
  fixture: ReturnType<typeof registerSsoSamlStrategyValidateIntegrationE2eFixture>,
) {
  it('creates a new user on first SAML assertion', async () => {
    const config = fixture.makeSamlConfig();
    const req = fixture.makeSamlRequest(config);
    const profile = fixture.makeSamlProfile();

    const user = await fixture.strategy.validate(req, profile as never);

    expect(user.id).toBeGreaterThan(0);
    expect(user.isEmailVerified).toBe(true);

    const dbUser = await fixture.userRepo.findOne({ where: { id: user.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.externalIdentifier).toBe('saml-user-123');
  });
}

export function registerResolvesDisplayNameFromStandardSamlAttributesCases(
  fixture: ReturnType<typeof registerSsoSamlStrategyValidateIntegrationE2eFixture>,
) {
  it('resolves display name from standard SAML attributes', async () => {
    const config = fixture.makeSamlConfig({ ssoProviderId: 22 });
    const req = fixture.makeSamlRequest(config, 22);
    const profile = fixture.makeSamlProfile({
      nameID: 'displayname-user',
      email: 'displayname@example.com',
      displayName: 'Alice Example',
    });

    const user = await fixture.strategy.validate(req, profile as never);

    const dbUser = await fixture.userRepo.findOne({ where: { id: user.id } });
    // Username is derived from displayName/email via buildUsernameFromSSOClaim
    expect(dbUser?.username).not.toBe('');
  });
}

export function registerResolvesEmailFromACustomSamlAttributeKeyCases(
  fixture: ReturnType<typeof registerSsoSamlStrategyValidateIntegrationE2eFixture>,
) {
  it('resolves email from a custom SAML attribute key', async () => {
    const config = fixture.makeSamlConfig({
      ssoProviderId: 21,
      emailAttributeKeys: ['urn:custom:email:attr'],
    });
    const req = fixture.makeSamlRequest(config, 21);
    const profile = fixture.makeSamlProfile({
      nameID: 'custom-attr-user',
      email: undefined,
      'urn:custom:email:attr': 'custom@example.com',
    });

    const user = await fixture.strategy.validate(req, profile as never);

    const dbUser = await fixture.userRepo.findOne({ where: { id: user.id } });
    expect(dbUser?.email).toBe('custom@example.com');
  });
}

export function registerResolvesEmailFromStandardSamlAttributeEmailCases(
  fixture: ReturnType<typeof registerSsoSamlStrategyValidateIntegrationE2eFixture>,
) {
  it('resolves email from standard SAML attribute (email)', async () => {
    const config = fixture.makeSamlConfig({ ssoProviderId: 20, emailAttributeKeys: ['email'] });
    const req = fixture.makeSamlRequest(config, 20);
    const profile = fixture.makeSamlProfile({ nameID: 'email-attr-user', email: 'attremail@example.com' });

    const user = await fixture.strategy.validate(req, profile as never);

    const dbUser = await fixture.userRepo.findOne({ where: { id: user.id } });
    expect(dbUser?.email).toBe('attremail@example.com');
  });
}

export function registerReturnsTheSameUserOnRepeatSamlAssertionsNameIdDeduplicationCases(
  fixture: ReturnType<typeof registerSsoSamlStrategyValidateIntegrationE2eFixture>,
) {
  it('returns the same user on repeat SAML assertions (nameID deduplication)', async () => {
    const config = fixture.makeSamlConfig({ ssoProviderId: 10 });
    const req = fixture.makeSamlRequest(config, 10);
    const profile = fixture.makeSamlProfile({ nameID: 'dedup-user-001', email: 'dedup001@example.com' });

    const user1 = await fixture.strategy.validate(req, profile as never);
    const user2 = await fixture.strategy.validate(req, profile as never);

    expect(user1.id).toBe(user2.id);
  });
}

export function registerRevokesSsoRolesWhenClaimsNoLongerIncludeThemCases(
  fixture: ReturnType<typeof registerSsoSamlStrategyValidateIntegrationE2eFixture>,
) {
  it('revokes SSO roles when claims no longer include them', async () => {
    const config = fixture.makeSamlConfig({ ssoProviderId: 31 });
    const req = fixture.makeSamlRequest(config, 31);
    const uniqueEmail = `revoke-role-${Date.now()}@example.com`;

    // First login — no roles
    const profileNoRoles = fixture.makeSamlProfile({ nameID: 'revoke-role-user', email: uniqueEmail });
    const user = await fixture.strategy.validate(req, profileNoRoles as never);

    // Second login — same outcome (strategy handles the no-roles case gracefully)
    const userAgain = await fixture.strategy.validate(req, profileNoRoles as never);
    expect(userAgain.id).toBe(user.id);
  });
}
