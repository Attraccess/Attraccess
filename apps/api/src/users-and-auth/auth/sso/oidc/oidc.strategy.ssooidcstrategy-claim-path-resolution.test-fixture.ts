import { SSOProvider, SSOProviderOIDCConfiguration } from '@attraccess/database-entities';
import { ModuleRef } from '@nestjs/core';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { AuthService } from '../../auth.service';
import { SSOService } from '../sso.service';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { SSOOIDCStrategy } from './oidc.strategy';

export function registerSsooidcstrategyClaimPathResolutionFixture() {
  const callbackURL = 'http://localhost/cb';

  const mockStateStore = { store: jest.fn(), verify: jest.fn() } as unknown as OidcCookieStateStore;

  function createStrategy(
    config: Partial<SSOProviderOIDCConfiguration>,
    usersServiceMock: Partial<UsersService>,
    authServiceMock: Partial<AuthService>,
    rbacServiceMock?: Partial<RbacService>,
    ssoServiceMock?: Partial<SSOService>,
    ssoAuditMock?: Partial<SsoAuditService>,
  ) {
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === UsersService) return usersServiceMock;
        if (token === AuthService) return authServiceMock;
        if (token === RbacService) return rbacServiceMock ?? { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };
        if (token === SSOService) return ssoServiceMock;
        if (token === SsoAuditService) return ssoAuditMock;
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
  return {
    get createStrategy() {
      return createStrategy;
    },
  };
}
