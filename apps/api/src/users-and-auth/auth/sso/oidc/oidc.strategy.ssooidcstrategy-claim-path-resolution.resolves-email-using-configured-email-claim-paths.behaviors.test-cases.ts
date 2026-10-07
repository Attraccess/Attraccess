import { Profile } from 'passport-openidconnect';
import { User, AuthenticationType, SSOProviderType, SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import { registerSsooidcstrategyClaimPathResolutionFixture } from './oidc.strategy.ssooidcstrategy-claim-path-resolution.test-fixture';
import { SSOOIDCStrategy } from './oidc.strategy';

export function registerResolvesEmailUsingConfiguredEmailClaimPathsCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('resolves email using configured emailClaimPaths', async () => {
    const usersService = {
      findOne: jest.fn(async () => null),
      updateOne: jest.fn(),
      buildUsernameFromSSOClaim: jest.fn((raw: string) => raw),
      createOne: jest.fn(
        async ({ username, email, externalIdentifier }) =>
          ({
            id: 123,
            username,
            email,
            externalIdentifier,
          }) as unknown as User,
      ),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => null),
      addAuthenticationDetails: jest.fn(),
    };

    const strategy = fixture.createStrategy(
      {
        emailClaimPaths: ['mail'],
      },
      usersService,
      authService,
    );

    const profile = {
      id: 'ext-2',
      _json: { mail: 'jsonmail@example.com' },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);
    expect(user.email).toBe('jsonmail@example.com');
    expect(usersService.createOne).toHaveBeenCalled();
  });
}

export function registerResolvesUsernameUsingConfiguredUsernameClaimPathsCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('resolves username using configured usernameClaimPaths', async () => {
    const usersService = {
      findOne: jest.fn(async () => null),
      updateOne: jest.fn(),
      buildUsernameFromSSOClaim: jest.fn((raw: string) => raw),
      createOne: jest.fn(
        async ({ username, email, externalIdentifier }) =>
          ({
            id: 123,
            username,
            email,
            externalIdentifier,
          }) as unknown as User,
      ),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => null),
      addAuthenticationDetails: jest.fn(),
    };

    const strategy = fixture.createStrategy(
      {
        usernameClaimPaths: ['customUser'],
      },
      usersService,
      authService,
    );

    const profile = {
      id: 'ext-1',
      emails: [{ value: 'user@example.com' }],
      _json: { customUser: 'preferred.user' },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);
    expect(user.username).toBe('preferred.user');
    expect(user.email).toBe('user@example.com');
    expect(usersService.createOne).toHaveBeenCalled();
    expect(authService.addAuthenticationDetails).toHaveBeenCalledWith(123, {
      type: AuthenticationType.SSO,
      details: { providerId: 1, providerType: SSOProviderType.OIDC, subject: 'ext-1' },
    });
  });
}

export function registerRevokesPreviouslyGrantedSsoRolesAfterTheMappingHasBeenClearedCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('revokes previously granted SSO roles after the mapping has been cleared', async () => {
    const existingUser = { id: 223, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = {
      findOne: jest.fn(async () => existingUser),
      updateOne: jest.fn(),
      createOne: jest.fn(),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => existingUser.id),
      addAuthenticationDetails: jest.fn(),
    };

    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    // Admin emptied the mapping table → stored config is {} — sync must still run so roles
    // granted under the old mapping get revoked at next login.
    const strategy = fixture.createStrategy(
      { roleMappings: {} } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-cleared',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['attraccess_admin'] },
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(existingUser.id, [], SSOProviderType.OIDC, 1);
  });
}

export function registerRevokesProviderRolesWhenTheTokenContainsAnExplicitlyEmptyRoleClaimCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('revokes provider roles when the token contains an explicitly empty role claim', async () => {
    const existingUser = { id: 335, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = { findOne: jest.fn(async () => existingUser), updateOne: jest.fn(), createOne: jest.fn() };
    const authService = { findUserIdBySSO: jest.fn(async () => existingUser.id), addAuthenticationDetails: jest.fn() };
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const strategy = fixture.createStrategy(
      { roleMappings: { 'user-manager': ['attraccess_admin'] } } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-empty-groups',
      emails: [{ value: 'existing@example.com' }],
      _json: { groups: [] }, // claim key present but empty → authoritative, revoke
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(existingUser.id, [], SSOProviderType.OIDC, 1);
  });
}

export function registerStrategyOptionsPassedToPassportOpenidconnectCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  describe('strategy options passed to passport-openidconnect', () => {
    function readOptions(strategy: SSOOIDCStrategy): { scope: unknown; skipUserProfile: unknown } {
      const internal = strategy as unknown as { _scope: unknown; _skipUserProfile: unknown };
      return { scope: internal._scope, skipUserProfile: internal._skipUserProfile };
    }

    it('filters configured `openid` from scopes so it is not passed twice', () => {
      const strategy = fixture.createStrategy(
        { scopes: ['openid', 'email', 'profile'] },
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['email', 'profile']);
    });

    it('filters `openid` case-insensitively and trimmed from configured scopes', () => {
      const strategy = fixture.createStrategy(
        { scopes: [' OpenID ', 'Email', 'profile'] },
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['Email', 'profile']);
    });

    it('uses default scopes (without openid) when scopes is unset', () => {
      const strategy = fixture.createStrategy(
        {},
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['email', 'profile']);
    });

    it('uses default scopes (without openid) when scopes is an empty array', () => {
      const strategy = fixture.createStrategy(
        { scopes: [] },
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['email', 'profile']);
    });

    it('passes `skipUserProfile: false` explicitly so the userinfo endpoint is always fetched', () => {
      const strategy = fixture.createStrategy(
        {},
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).skipUserProfile).toBe(false);
    });
  });
}
