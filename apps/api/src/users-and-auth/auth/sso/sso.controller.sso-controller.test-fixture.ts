import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityAuditService } from '../../../audit/identity-audit.service';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { LicenseService } from '../../../license/license.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { SettingsService } from '../../../settings/settings.service';
import { RbacService } from '../../rbac/rbac.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { SSOLinkTokenService } from './link-token.service';
import { OidcCookieStateStore } from './oidc/oidc-cookie-state-store';
import { SSOOIDCGuard } from './oidc/oidc.guard';
import { SSOController } from './sso.controller';
import { SSOService } from './sso.service';

const mockMetricsService = {
  authSsoLoginTotal: { inc: jest.fn() },
  authSsoLoginFailuresTotal: { inc: jest.fn() },
};
export function registerSsoControllerFixture() {
  let controller: SSOController;

  let ssoService: SSOService;

  let module: TestingModule;

  let cookieConfigService: CookieConfigService;

  let linkTokenService: SSOLinkTokenService;

  const identityAudit = { record: jest.fn() };

  const ssoAudit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

  const mockSSOProvider: SSOProvider = {
    id: 1,
    name: 'Test Provider',
    type: SSOProviderType.OIDC,
    createdAt: new Date(),
    updatedAt: new Date(),
    oidcConfiguration: {
      id: 1,
      ssoProviderId: 1,
      issuer: 'https://test-issuer.com',
      authorizationURL: 'https://test-issuer.com/auth',
      tokenURL: 'https://test-issuer.com/token',
      userInfoURL: 'https://test-issuer.com/userinfo',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      roleMappings: {
        'user-manager': ['attraccess_admin'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  } as unknown as SSOProvider;

  const mockSamlProvider: SSOProvider = {
    id: 2,
    name: 'Test SAML Provider',
    type: SSOProviderType.SAML,
    createdAt: new Date(),
    updatedAt: new Date(),
    samlConfiguration: {
      id: 2,
      ssoProviderId: 2,
      entryPoint: 'https://idp.example.com/sso',
      issuer: 'https://sp.example.com',
      certificate: 'CERT',
      signRequest: false,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: true,
      forceAuthn: false,
      provisioningSecret: 'saml-secret',
      roleMappings: {
        'billing-manager': ['billing-role'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ssoProvider: null,
    },
  } as unknown as SSOProvider;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            userHasSSOAuthentication: jest.fn(),
            findSSOAuthenticationDetail: jest.fn(),
            updateSSOSubject: jest.fn(),
            validateAuthenticationDetails: jest.fn(),
            findUserIdBySSO: jest.fn(),
            addAuthenticationDetails: jest.fn(),
            removeAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue('mock-session-token'),
            revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SSOService,
          useValue: {
            getAllProviders: jest.fn().mockResolvedValue([mockSSOProvider]),
            getProviderById: jest.fn().mockResolvedValue(mockSSOProvider),
            getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(mockSSOProvider),
            createProvider: jest.fn().mockResolvedValue(mockSSOProvider),
            updateProvider: jest.fn().mockResolvedValue(mockSSOProvider),
            deleteProvider: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            findOneBySSO: jest.fn(),
            updateOne: jest.fn(),
            deleteOne: jest.fn(),
          },
        },
        {
          provide: RbacService,
          useValue: {
            syncSsoRoles: jest.fn().mockResolvedValue({ added: ['user-manager'], removed: [], updated: [] }),
            getRoles: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CookieConfigService,
          useValue: {
            getConfig: jest.fn().mockReturnValue({
              name: 'auth-session',
              httpOnly: true,
              secure: false,
              sameSite: 'lax',
              maxAge: 7 * 24 * 60 * 60 * 1000,
              path: '/',
            }),
            setAuthCookie: jest.fn(),
            clearAuthCookie: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getUrl: jest.fn().mockResolvedValue('http://localhost:3000'),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue({
              valid: true,
              payload: { cfg: { modules: ['sso'], usageLimits: {} } },
            }),
          },
        },
        {
          provide: SSOLinkTokenService,
          useValue: {
            verify: jest.fn(),
            issue: jest.fn(),
          },
        },
        {
          provide: OidcCookieStateStore,
          useValue: {},
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        { provide: IdentityAuditService, useValue: identityAudit },
        { provide: SsoAuditService, useValue: ssoAudit },
        SSOOIDCGuard,
      ],
      controllers: [SSOController],
    }).compile();

    controller = module.get<SSOController>(SSOController);
    ssoService = module.get<SSOService>(SSOService);
    cookieConfigService = module.get<CookieConfigService>(CookieConfigService);
    linkTokenService = module.get<SSOLinkTokenService>(SSOLinkTokenService);
    identityAudit.record.mockReset();
    ssoAudit.record.mockReset().mockResolvedValue({ status: 'recorded' });
  });
  return {
    get controller() {
      return controller;
    },
    get ssoService() {
      return ssoService;
    },
    get module() {
      return module;
    },
    get cookieConfigService() {
      return cookieConfigService;
    },
    get linkTokenService() {
      return linkTokenService;
    },
    get identityAudit() {
      return identityAudit;
    },
    get ssoAudit() {
      return ssoAudit;
    },
    get mockSSOProvider() {
      return mockSSOProvider;
    },
    get mockSamlProvider() {
      return mockSamlProvider;
    },
  };
}
