import { ExecutionContext } from '@nestjs/common';
import { SSOOIDCGuard } from './oidc.guard';
import { SSOOIDCStrategy, SSO_OIDC_CALLBACK_URL_REQUEST_KEY, SSO_OIDC_STATE_REQUEST_KEY } from './oidc.strategy';
import { SettingsService } from '../../../../settings/settings.service';
import { SSOService } from '../sso.service';
import { LicenseService } from '../../../../license/license.service';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { ModuleRef } from '@nestjs/core';
import { SSOProvider } from '@attraccess/database-entities';
import { MetricsService } from '../../../../metrics/metrics.service';

// Mock the strategy module so `new SSOOIDCStrategy(...)` doesn't invoke
// the real passport constructor but lets us assert it was called correctly.
jest.mock('./oidc.strategy', () => {
  const actual = jest.requireActual('./oidc.strategy');
  return {
    ...actual,
    SSOOIDCStrategy: jest.fn(),
  };
});

describe('SSOOIDCGuard', () => {
  let guard: SSOOIDCGuard;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getUrl'>>;
  let ssoService: jest.Mocked<Pick<SSOService, 'getProviderByTypeAndIdWithConfiguration'>>;
  let licenseService: jest.Mocked<Pick<LicenseService, 'verifyLicense'>>;
  let mockModuleRef: ModuleRef;
  let mockStateStore: OidcCookieStateStore;
  let metricsService: jest.Mocked<Pick<MetricsService, 'authSsoLoginFailuresTotal'>>;

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
      scopes: null,
      usernameClaimPaths: null,
      emailClaimPaths: null,
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
    (SSOOIDCStrategy as jest.Mock).mockClear();

    settingsService = {
      getUrl: jest.fn().mockResolvedValue('https://api.example.com'),
    };
    ssoService = {
      getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(mockOidcProvider),
    };
    licenseService = {
      verifyLicense: jest.fn().mockResolvedValue({ valid: true }),
    };

    mockModuleRef = {} as ModuleRef;
    mockStateStore = {} as OidcCookieStateStore;
    metricsService = {
      authSsoLoginFailuresTotal: { inc: jest.fn() } as never,
    };

    guard = new SSOOIDCGuard(
      ssoService as unknown as SSOService,
      mockModuleRef,
      settingsService as unknown as SettingsService,
      licenseService as unknown as LicenseService,
      mockStateStore,
      metricsService as unknown as MetricsService,
    );
  });

  it('sets per-request callback URL (fixed, no query) and state with redirectTo on request', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/login?redirectTo=/dashboard',
    };
    const context = createContext(req);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toBe('https://api.example.com/api/auth/sso/OIDC/1/callback');
    expect(req[SSO_OIDC_STATE_REQUEST_KEY]).toEqual({ redirectTo: '/dashboard' });
  });

  it('builds fixed callback URL from URL setting and provider id, passes redirectTo in state', async () => {
    settingsService.getUrl.mockResolvedValue('https://backend.mycompany.com');
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/42/login?redirectTo=/home',
    };
    const context = createContext(req);

    await guard.canActivate(context);

    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toBe('https://backend.mycompany.com/api/auth/sso/OIDC/42/callback');
    expect(req[SSO_OIDC_STATE_REQUEST_KEY]).toEqual({ redirectTo: '/home' });
  });

  it('allows callback route without redirectTo (redirectTo comes from state)', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/callback?code=abc&state=xyz',
    };
    const context = createContext(req);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req[SSO_OIDC_CALLBACK_URL_REQUEST_KEY]).toBe('https://api.example.com/api/auth/sso/OIDC/1/callback');
    expect(req[SSO_OIDC_STATE_REQUEST_KEY]).toBeUndefined();
  });

  it('records OIDC guard rejections as SSO login failures', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/not-a-number/login?redirectTo=/dashboard',
    };

    await expect(guard.canActivate(createContext(req))).rejects.toThrow();

    expect(metricsService.authSsoLoginFailuresTotal.inc).toHaveBeenCalledWith({
      provider_type: 'oidc',
      reason: 'guard_rejected',
    });
  });

  // ─── Regression guards: strategy must be created per request with real config ──

  it('creates a new SSOOIDCStrategy per request with the real provider config from the database', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/login?redirectTo=/dashboard',
    };

    await guard.canActivate(createContext(req));

    expect(SSOOIDCStrategy).toHaveBeenCalledTimes(1);
    expect(SSOOIDCStrategy).toHaveBeenCalledWith(
      mockModuleRef,
      mockOidcProvider.oidcConfiguration,
      expect.stringContaining('/api/auth/sso/OIDC/1/callback'),
      mockStateStore,
    );
  });

  it('passes the exact OidcCookieStateStore instance to the strategy', async () => {
    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/login?redirectTo=/dashboard',
    };

    await guard.canActivate(createContext(req));

    const stateStoreArg = (SSOOIDCStrategy as jest.Mock).mock.calls[0][3];
    expect(stateStoreArg).toBe(mockStateStore);
  });

  it('creates strategy with the correct provider config when different providers are used', async () => {
    const provider42Config = {
      ...mockOidcProvider.oidcConfiguration,
      id: 42,
      ssoProviderId: 42,
      issuer: 'https://other-issuer.example',
      authorizationURL: 'https://other-issuer.example/auth',
      tokenURL: 'https://other-issuer.example/token',
      userInfoURL: 'https://other-issuer.example/userinfo',
      clientId: 'other-client',
      clientSecret: 'other-secret',
    };
    ssoService.getProviderByTypeAndIdWithConfiguration.mockResolvedValue({
      ...mockOidcProvider,
      id: 42,
      oidcConfiguration: provider42Config,
    } as unknown as SSOProvider);

    const req: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/42/login?redirectTo=/home',
    };

    await guard.canActivate(createContext(req));

    expect(SSOOIDCStrategy).toHaveBeenCalledWith(
      mockModuleRef,
      provider42Config,
      expect.stringContaining('/api/auth/sso/OIDC/42/callback'),
      mockStateStore,
    );
  });

  it('creates a fresh strategy on each request (not reusing a stale instance)', async () => {
    const req1: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/login?redirectTo=/a',
    };
    const req2: Record<string, unknown> = {
      url: '/api/auth/sso/OIDC/1/login?redirectTo=/b',
    };

    await guard.canActivate(createContext(req1));
    await guard.canActivate(createContext(req2));

    expect(SSOOIDCStrategy).toHaveBeenCalledTimes(2);
  });
});
