import { ExecutionContext } from '@nestjs/common';
import { SSOOIDCGuard } from './oidc.guard';
import { SSO_OIDC_CALLBACK_URL_REQUEST_KEY } from './oidc.strategy';
import { SettingsService } from '../../../../settings/settings.service';
import { SSOService } from '../sso.service';
import { LicenseService } from '../../../../license/license.service';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { ModuleRef } from '@nestjs/core';

describe('SSOOIDCGuard', () => {
  let guard: SSOOIDCGuard;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getUrl'>>;
  let ssoService: jest.Mocked<Pick<SSOService, 'getProviderByTypeAndIdWithConfiguration'>>;
  let licenseService: jest.Mocked<Pick<LicenseService, 'verifyLicense'>>;

  const mockOidcProvider = {
    id: 1,
    type: 'oidc' as const,
    oidcConfiguration: {
      id: 1,
      ssoProviderId: 1,
      issuer: 'https://issuer.example',
      authorizationURL: 'https://issuer.example/auth',
      tokenURL: 'https://issuer.example/token',
      userInfoURL: 'https://issuer.example/userinfo',
      clientId: 'client',
      clientSecret: 'secret',
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  };

  function createContext(req: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    settingsService = {
      getUrl: jest.fn().mockResolvedValue('https://api.example.com'),
    };
    ssoService = {
      getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(mockOidcProvider),
    };
    licenseService = {
      verifyLicense: jest.fn().mockResolvedValue({ valid: true }),
    };

    guard = new SSOOIDCGuard(
      ssoService as unknown as SSOService,
      {} as ModuleRef,
      settingsService as unknown as SettingsService,
      licenseService as unknown as LicenseService,
      {} as OidcCookieStateStore,
    );
  });

  it('sets per-request callback URL on request so strategy uses current settings (no restart needed)', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/login?redirectTo=/dashboard',
    };
    const context = createContext(req);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('api.example.com');
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('/api/auth/sso/OIDC/1/callback');
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('redirectTo');
  });

  it('builds callback URL from URL setting and provider id', async () => {
    settingsService.getUrl.mockResolvedValue('https://backend.mycompany.com');
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/42/login?redirectTo=/home',
    };
    const context = createContext(req);

    await guard.canActivate(context);

    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('https://backend.mycompany.com');
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('/api/auth/sso/OIDC/42/callback');
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('redirectTo');
  });

  it('allows callback route without redirectTo (IdP may strip query params)', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/callback?code=abc&state=xyz',
    };
    const context = createContext(req);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toContain('/api/auth/sso/OIDC/1/callback');
  });
});
