import { SsoLogoutService } from './sso/sso-logout.service';
import { SettingsService } from '../../settings/settings.service';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { CookieConfigService } from '../../common/services/cookie-config.service';
import { AuthAuditLogger } from '../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../rate-limiting/brute-force.service';
import { LoginRateLimitGuard } from '../rate-limiting/login.rate-limit.guard';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

const passportRequest = require('passport/lib/http/request') as {
  logout(this: object, callback: (error?: Error) => void): void;
};
export function registerAuthControllerFixture() {
  let authController: AuthController;

  let sessionService: SessionService;

  let cookieConfigService: CookieConfigService;

  let identityAudit: { record: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {},
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue('test-session-token'),
            refreshSession: jest.fn().mockResolvedValue('new-session-token'),
            revokeSession: jest.fn(),
            revokeLogoutSession: jest.fn(),
            getLogoutSession: jest.fn().mockResolvedValue({
              id: 'stable-session',
              ssoContext: { protocol: 'OIDC', providerId: 1, issuer: 'https://idp.example', subject: 'person' },
            }),
            validateSession: jest.fn().mockResolvedValue({ id: 7 }),
            getSsoContext: jest
              .fn()
              .mockResolvedValue({ protocol: 'OIDC', providerId: 1, issuer: 'https://idp.example', subject: 'person' }),
          },
        },
        {
          provide: CookieConfigService,
          useValue: {
            getCookieName: jest.fn().mockReturnValue('auth-session'),
            setAuthCookie: jest.fn(),
            clearAuthCookie: jest.fn(),
          },
        },
        {
          provide: BruteForceProtectionService,
          useValue: {
            assertIpAllowed: jest.fn().mockResolvedValue(undefined),
            assertAccountAllowed: jest.fn().mockResolvedValue(undefined),
            recordFailure: jest.fn().mockResolvedValue(undefined),
            recordSuccess: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: SsoLogoutService,
          useValue: {
            prepare: jest.fn().mockResolvedValue({ kind: 'redirect', redirectUrl: 'https://idp.example/logout' }),
            returnURL: async () => 'https://app.example/',
          },
        },
        { provide: SettingsService, useValue: { getUrl: async () => 'https://app.example' } },
        { provide: IdentityAuditService, useValue: { record: jest.fn() } },
        { provide: LoginRateLimitGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    sessionService = module.get<SessionService>(SessionService);
    cookieConfigService = module.get<CookieConfigService>(CookieConfigService);
    identityAudit = module.get(IdentityAuditService);
  });
  return {
    get passportRequest() {
      return passportRequest;
    },
    get authController() {
      return authController;
    },
    get sessionService() {
      return sessionService;
    },
    get cookieConfigService() {
      return cookieConfigService;
    },
    get identityAudit() {
      return identityAudit;
    },
  };
}
