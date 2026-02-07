import { ModuleRef } from '@nestjs/core';
import { Profile, Strategy } from 'passport-openidconnect';
import { SSOOIDCStrategy, SSO_OIDC_CALLBACK_URL_REQUEST_KEY } from './oidc.strategy';
import { AuthService } from '../../auth.service';
import {
  AuthenticationType,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  User,
} from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';

describe('SSOOIDCStrategy - claim path resolution', () => {
  const callbackURL = 'http://localhost/cb';

  function createStrategy(
    config: Partial<SSOProviderOIDCConfiguration>,
    usersServiceMock: Partial<UsersService>,
    authServiceMock: Partial<AuthService>,
  ) {
    const moduleRef = {
      get: jest.fn(async (token: unknown) => {
        if (token === UsersService) return usersServiceMock;
        if (token === AuthService) return authServiceMock;
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

    return new SSOOIDCStrategy(moduleRef, { ...baseConfig, ...config }, callbackURL);
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

  it('syncs permissions from role claims when available', async () => {
    const existingUser = {
      id: 222,
      username: 'existing',
      email: 'existing@example.com',
      systemPermissions: {
        canManageResources: false,
        canManageSystemConfiguration: false,
        canManageUsers: false,
        canManageBilling: false,
      },
    } as unknown as User;

    const usersService = {
      findOne: jest.fn(async () => existingUser),
      updateOne: jest.fn(async (_id, update) => ({
        ...existingUser,
        systemPermissions: update.systemPermissions,
      })),
      createOne: jest.fn(),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => existingUser.id),
      addAuthenticationDetails: jest.fn(),
    };

    const strategy = createStrategy({}, usersService, authService);

    const profile = {
      id: 'ext-roles',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['canManageUsers', 'canManageBilling'] },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);

    expect(usersService.updateOne).toHaveBeenCalledWith(existingUser.id, {
      systemPermissions: {
        canManageResources: false,
        canManageSystemConfiguration: false,
        canManageUsers: true,
        canManageBilling: true,
      },
    });
    expect(user.systemPermissions.canManageUsers).toBe(true);
    expect(user.systemPermissions.canManageBilling).toBe(true);
  });

  it('honors configured permission mappings and can revoke permissions', async () => {
    const existingUser = {
      id: 333,
      username: 'existing',
      email: 'existing@example.com',
      systemPermissions: {
        canManageResources: false,
        canManageSystemConfiguration: false,
        canManageUsers: true,
        canManageBilling: false,
      },
    } as unknown as User;

    const usersService = {
      findOne: jest.fn(async () => existingUser),
      updateOne: jest.fn(async (_id, update) => ({
        ...existingUser,
        systemPermissions: update.systemPermissions,
      })),
      createOne: jest.fn(),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => existingUser.id),
      addAuthenticationDetails: jest.fn(),
    };

    const strategy = createStrategy(
      {
        permissionMappings: {
          canManageUsers: ['attraccess_admin'],
        },
      },
      usersService,
      authService,
    );

    const profile = {
      id: 'ext-mapping',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['other-role'] },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);

    expect(usersService.updateOne).toHaveBeenCalledWith(existingUser.id, {
      systemPermissions: {
        canManageResources: false,
        canManageSystemConfiguration: false,
        canManageUsers: false,
        canManageBilling: false,
      },
    });
    expect(user.systemPermissions.canManageUsers).toBe(false);
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
