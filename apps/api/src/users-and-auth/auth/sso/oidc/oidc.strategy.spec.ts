import { ModuleRef } from '@nestjs/core';
import { Profile, Strategy } from 'passport-openidconnect';
import { SSOOIDCStrategy, SSO_OIDC_CALLBACK_URL_REQUEST_KEY } from './oidc.strategy';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { AuthService } from '../../auth.service';
import {
  AuthenticationType,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  User,
} from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';
import { RbacService } from '../../../rbac/rbac.service';

describe('SSOOIDCStrategy - claim path resolution', () => {
  const callbackURL = 'http://localhost/cb';
  const mockStateStore = { store: jest.fn(), verify: jest.fn() } as unknown as OidcCookieStateStore;

  function createStrategy(
    config: Partial<SSOProviderOIDCConfiguration>,
    usersServiceMock: Partial<UsersService>,
    authServiceMock: Partial<AuthService>,
    rbacServiceMock?: Partial<RbacService>,
  ) {
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === UsersService) return usersServiceMock;
        if (token === AuthService) return authServiceMock;
        if (token === RbacService) return rbacServiceMock ?? { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };
        throw new Error('Unexpected dependency request');
      }),
    } as unknown as ModuleRef;

    const baseConfig: SSOProviderOIDCConfiguration = {
      id: 1,
      ssoProviderId: 1,
      issuer: 'https://issuer',
      authorizationURL: 'https://issuer/auth',
      tokenURL: 'https://issuer/token',
      userInfoURL: 'https://issuer/userinfo',
      clientId: 'client',
      clientSecret: 'secret',
      createdAt: new Date(),
      updatedAt: new Date(),
      scopes: null,
      usernameClaimPaths: null,
      emailClaimPaths: null,
      ssoProvider: {} as SSOProvider,
    };

    return new SSOOIDCStrategy(moduleRef, { ...baseConfig, ...config }, callbackURL, mockStateStore);
  }

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

    const strategy = createStrategy(
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

    const strategy = createStrategy(
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

  it('normalizes SSO usernames before user creation', async () => {
    const usersService = {
      findOne: jest.fn(async () => null),
      updateOne: jest.fn(),
      buildUsernameFromSSOClaim: jest.fn(() => 'name.surname'),
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

    const strategy = createStrategy(
      {
        usernameClaimPaths: ['customUser'],
      },
      usersService,
      authService,
    );

    const profile = {
      id: 'ext-3',
      emails: [{ value: 'user@example.com' }],
      _json: { customUser: 'Name Surname' },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);
    expect(usersService.buildUsernameFromSSOClaim).toHaveBeenCalledWith('Name Surname', 'user@example.com');
    expect(user.username).toBe('name.surname');
    expect(usersService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'name.surname',
        email: 'user@example.com',
      }),
    );
  });

  it('syncs with zero assignments when no roleMappings configured (no-op for fresh providers)', async () => {
    const existingUser = { id: 222, username: 'existing', email: 'existing@example.com' } as User;

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

    const strategy = createStrategy({}, usersService, authService, rbacService);

    const profile = {
      id: 'ext-roles',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['some-role'] },
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(existingUser.id, [], SSOProviderType.OIDC, 1);
  });

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
    const strategy = createStrategy(
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

  it('honors configured permission mappings and revokes absent roles', async () => {
    const existingUser = { id: 333, username: 'existing', email: 'existing@example.com' } as User;

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

    const strategy = createStrategy(
      {
        roleMappings: { 'user-manager': ['attraccess_admin'] },
      } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-mapping',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['other-role'] }, // 'other-role' not in mapping → no roles granted
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    // syncSsoRoles called with empty set; existing SSO roles will be revoked
    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(existingUser.id, [], SSOProviderType.OIDC, 1);
  });

  it('passes the external claim value that granted each role to the sync', async () => {
    const existingUser = { id: 334, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = { findOne: jest.fn(async () => existingUser), updateOne: jest.fn(), createOne: jest.fn() };
    const authService = { findUserIdBySSO: jest.fn(async () => existingUser.id), addAuthenticationDetails: jest.fn() };
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const strategy = createStrategy(
      { roleMappings: { 'user-manager': ['attraccess_admin'] } } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-external-value',
      emails: [{ value: 'existing@example.com' }],
      _json: { groups: ['Attraccess Admin'] }, // matches 'attraccess_admin' after normalization
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
      existingUser.id,
      [{ roleKey: 'user-manager', externalValue: 'Attraccess Admin' }],
      SSOProviderType.OIDC,
      1,
    );
  });

  it('revokes provider roles when the token contains an explicitly empty role claim', async () => {
    const existingUser = { id: 335, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = { findOne: jest.fn(async () => existingUser), updateOne: jest.fn(), createOne: jest.fn() };
    const authService = { findUserIdBySSO: jest.fn(async () => existingUser.id), addAuthenticationDetails: jest.fn() };
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const strategy = createStrategy(
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

  it('does not sync when the token contains no role/group claims at all', async () => {
    const existingUser = { id: 336, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = { findOne: jest.fn(async () => existingUser), updateOne: jest.fn(), createOne: jest.fn() };
    const authService = { findUserIdBySSO: jest.fn(async () => existingUser.id), addAuthenticationDetails: jest.fn() };
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const strategy = createStrategy(
      { roleMappings: { 'user-manager': ['attraccess_admin'] } } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-no-claims',
      emails: [{ value: 'existing@example.com' }],
      _json: { email: 'existing@example.com' }, // no roles/groups keys → missing scope, do not revoke
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
  });

  describe('strategy options passed to passport-openidconnect', () => {
    function readOptions(strategy: SSOOIDCStrategy): { scope: unknown; skipUserProfile: unknown } {
      const internal = strategy as unknown as { _scope: unknown; _skipUserProfile: unknown };
      return { scope: internal._scope, skipUserProfile: internal._skipUserProfile };
    }

    it('filters configured `openid` from scopes so it is not passed twice', () => {
      const strategy = createStrategy(
        { scopes: ['openid', 'email', 'profile'] },
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['email', 'profile']);
    });

    it('filters `openid` case-insensitively and trimmed from configured scopes', () => {
      const strategy = createStrategy(
        { scopes: [' OpenID ', 'Email', 'profile'] },
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['Email', 'profile']);
    });

    it('uses default scopes (without openid) when scopes is unset', () => {
      const strategy = createStrategy(
        {},
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['email', 'profile']);
    });

    it('uses default scopes (without openid) when scopes is an empty array', () => {
      const strategy = createStrategy(
        { scopes: [] },
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).scope).toEqual(['email', 'profile']);
    });

    it('passes `skipUserProfile: false` explicitly so the userinfo endpoint is always fetched', () => {
      const strategy = createStrategy(
        {},
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn(), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      expect(readOptions(strategy).skipUserProfile).toBe(false);
    });
  });

  describe('authenticate (per-request callback URL)', () => {
    it('passes callback URL from request to base strategy when set (no restart needed for URL changes)', () => {
      const baseAuthenticateSpy = jest.spyOn(Strategy.prototype, 'authenticate').mockImplementation(() => {
        /* noop: avoid running real Passport strategy */
      });
      const strategy = createStrategy(
        {},
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn((s: string) => s), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      const dynamicCallback = 'https://api.example.com/api/auth/sso/oidc/1/callback?redirectTo=/dashboard';
      const req = { [SSO_OIDC_CALLBACK_URL_REQUEST_KEY]: dynamicCallback } as unknown as Parameters<SSOOIDCStrategy['authenticate']>[0];

      strategy.authenticate(req, undefined);

      expect(baseAuthenticateSpy).toHaveBeenCalledWith(req, { callbackURL: dynamicCallback });
      baseAuthenticateSpy.mockRestore();
    });

    it('passes through options when request has no callback URL key', () => {
      const baseAuthenticateSpy = jest.spyOn(Strategy.prototype, 'authenticate').mockImplementation(() => {
        /* noop */
      });
      const strategy = createStrategy(
        {},
        { findOne: jest.fn(), updateOne: jest.fn(), buildUsernameFromSSOClaim: jest.fn((s: string) => s), createOne: jest.fn() },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      const req = {} as unknown as Parameters<SSOOIDCStrategy['authenticate']>[0];
      const options = undefined;

      strategy.authenticate(req, options);

      expect(baseAuthenticateSpy).toHaveBeenCalledWith(req, options);
      baseAuthenticateSpy.mockRestore();
    });
  });
});
