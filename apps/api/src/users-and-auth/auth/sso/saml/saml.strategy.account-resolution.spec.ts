import { SSOProviderType } from '@attraccess/database-entities';
import { UnauthorizedException } from '@nestjs/common';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { SSOSamlStrategy } from './saml.strategy';
import {
  buildSamlModuleRef,
  registerSsosamlStrategyFixture,
  type SamlProfile,
} from './saml.strategy.ssosaml-strategy.test-fixture';

describe('SSOSamlStrategy - account resolution', () => {
  const fixture = registerSsosamlStrategyFixture();
  const profile = { nameID: 'shared-name-id', email: 'user@example.com' } as SamlProfile;

  /** Bindings keyed by "providerId:subject", like authentication_detail. */
  function setup(bindings: Record<string, number> = {}, emailOwner: Record<string, unknown> | null = null) {
    const users = {
      findOne: jest.fn(async (query: Record<string, unknown>) => ('email' in query ? emailOwner : { id: query.id })),
      updateOne: jest.fn(),
      createOne: jest.fn(async () => ({ id: 200 })),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
    };
    const auth = {
      findUserIdBySSO: jest.fn(
        async (_type: SSOProviderType, providerId: number, subject: string) =>
          bindings[`${providerId}:${subject}`] ?? null,
      ),
      addAuthenticationDetails: jest.fn(),
    };
    const metrics = { authSsoLoginFailuresTotal: { inc: jest.fn() } };
    const strategy = new SSOSamlStrategy(buildSamlModuleRef({ users, auth, metrics }));
    const audit = jest.spyOn(
      strategy as unknown as { recordProvisioningAudit: () => Promise<void> },
      'recordProvisioningAudit',
    );
    return { users, auth, metrics, audit, strategy };
  }

  it('logs in a user bound to (SAML, provider, NameID)', async () => {
    const { strategy, auth, users, audit } = setup({ '10:shared-name-id': 5 });
    await expect(strategy.validate(fixture.buildRequest(10, 'email'), profile)).resolves.toMatchObject({ id: 5 });
    expect(auth.findUserIdBySSO).toHaveBeenCalledWith(SSOProviderType.SAML, 10, 'shared-name-id');
    expect(users.createOne).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalledWith(5, 10, 'user_created');
  });

  it('does not open the provider A user for the same NameID from provider B', async () => {
    const { strategy, users } = setup({ '10:shared-name-id': 5 }, { id: 5 });
    await expect(strategy.validate(fixture.buildRequest(20, 'email'), profile)).rejects.toMatchObject({
      providerId: 20,
      externalId: 'shared-name-id',
      providerType: SSOProviderType.SAML,
    });
    expect(users.updateOne).not.toHaveBeenCalled();
  });

  it('creates a new account for provider B when the email matches nobody', async () => {
    const { strategy, users, auth, audit } = setup({ '10:shared-name-id': 5 });
    await expect(strategy.validate(fixture.buildRequest(20, 'email'), profile)).resolves.toMatchObject({ id: 200 });
    expect(audit).toHaveBeenCalledWith(200, 20, 'user_created');
    expect(users.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ externalIdentifier: null }),
      expect.anything(),
    );
    expect(auth.addAuthenticationDetails).toHaveBeenCalledWith(
      200,
      { type: 'sso', details: { providerId: 20, providerType: SSOProviderType.SAML, subject: 'shared-name-id' } },
      expect.anything(),
    );
  });

  it('requires account linking for an email match without auth details instead of linking silently', async () => {
    // The exact shape main used to link silently: an email owner without any authentication details.
    const { strategy, users, auth, metrics } = setup({}, { id: 7, authenticationDetails: [] });
    const error = await strategy
      .validate(fixture.buildRequest(10, 'email'), profile)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AccountLinkingRequiredException);
    expect(users.updateOne).not.toHaveBeenCalled();
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
    expect(users.createOne).not.toHaveBeenCalled();
    expect(metrics.authSsoLoginFailuresTotal.inc).not.toHaveBeenCalled();
  });

  it('records a metric and rejects when user creation fails', async () => {
    const { strategy, users, metrics } = setup();
    users.createOne.mockRejectedValue(new Error('duplicate username'));
    await expect(strategy.validate(fixture.buildRequest(10, 'email'), profile)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.authSsoLoginFailuresTotal.inc).toHaveBeenCalledTimes(1);
  });
});
