import { ModuleRef } from '@nestjs/core';
import { Profile } from 'passport-openidconnect';
import { SSOOIDCStrategy } from './oidc.strategy';
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
});
