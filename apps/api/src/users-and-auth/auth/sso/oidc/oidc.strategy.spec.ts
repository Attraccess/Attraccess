import { ModuleRef } from '@nestjs/core';
import { Profile } from 'passport-openidconnect';
import { SSOOIDCStrategy } from './oidc.strategy';
import { SSOProvider, SSOProviderOIDCConfiguration, User } from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';

describe('SSOOIDCStrategy - claim path resolution', () => {
  const callbackURL = 'http://localhost/cb';

  function createStrategy(config: Partial<SSOProviderOIDCConfiguration>, usersServiceMock: Partial<UsersService>) {
    const moduleRef = {
      get: jest.fn(async () => usersServiceMock),
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

    const strategy = createStrategy(
      {
        usernameClaimPaths: ['customUser'],
      },
      usersService,
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

    const strategy = createStrategy(
      {
        emailClaimPaths: ['mail'],
      },
      usersService,
    );

    const profile = {
      id: 'ext-2',
      _json: { mail: 'jsonmail@example.com' },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);
    expect(user.email).toBe('jsonmail@example.com');
    expect(usersService.createOne).toHaveBeenCalled();
  });
});
