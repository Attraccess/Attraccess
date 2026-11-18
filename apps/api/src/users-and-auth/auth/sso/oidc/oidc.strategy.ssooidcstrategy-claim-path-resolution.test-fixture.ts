import { AuditRecorder } from '../../../../audit/recorder/audit-event';
import type { SsoOidcConfigurationRecord, SsoProviderRecord } from '@attraccess/application-models';
import { ModuleRef } from '@nestjs/core';
import { MetricsService } from '../../../../metrics/metrics.service';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { AuthService } from '../../auth.service';
import { SSOService } from '../sso.service';
import { SsoAccountResolver } from '../account-resolution/sso-account-resolver.service';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { SSOOIDCStrategy } from './oidc.strategy';

/** The SSO service mock records sign-in provisioning through the real method, on the given recorder. */
export function withSignInProvisioning<T extends object>(sso: T | undefined, audit: unknown): T | undefined {
  if (!sso) return sso;
  return Object.assign(Object.create(sso), {
    audit,
    recordSignInProvisioning(this: SSOService, ...args: Parameters<SSOService['recordSignInProvisioning']>) {
      return SSOService.prototype.recordSignInProvisioning.apply(this, args);
    },
  });
}

export function registerSsooidcstrategyClaimPathResolutionFixture() {
  const callbackURL = 'http://localhost/cb';

  const mockStateStore = { store: jest.fn(), verify: jest.fn() } as unknown as OidcCookieStateStore;

  function createStrategy(
    config: Partial<SsoOidcConfigurationRecord>,
    usersServiceMock: Partial<UsersService>,
    authServiceMock: Partial<AuthService>,
    rbacServiceMock?: Partial<RbacService>,
    ssoServiceMock?: Partial<SSOService>,
    ssoAuditMock?: Partial<AuditRecorder>,
    metricsServiceMock?: Partial<MetricsService>,
  ) {
    const withTransaction = (work: (manager: unknown) => unknown) => work({});
    const resolver = new SsoAccountResolver(
      { recordCreatedUser: jest.fn(), withTransaction, ...usersServiceMock } as UsersService,
      authServiceMock as AuthService,
    );
    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === SsoAccountResolver) return resolver;
        if (token === UsersService) return usersServiceMock;
        if (token === AuthService) return authServiceMock;
        if (token === RbacService) return rbacServiceMock ?? { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };
        if (token === SSOService) return withSignInProvisioning(ssoServiceMock, ssoAuditMock);
        if (token === MetricsService && metricsServiceMock) return metricsServiceMock;
        throw new Error('Unexpected dependency request');
      }),
    } as unknown as ModuleRef;

    const baseConfig: SsoOidcConfigurationRecord = {
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
      ssoProvider: {} as SsoProviderRecord,
    };

    return new SSOOIDCStrategy(moduleRef, { ...baseConfig, ...config }, callbackURL, mockStateStore);
  }
  return {
    get createStrategy() {
      return createStrategy;
    },
  };
}
