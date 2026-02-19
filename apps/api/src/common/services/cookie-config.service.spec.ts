import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CookieConfigService } from './cookie-config.service';
import { SettingsService } from '../../settings/settings.service';
import { Response } from 'express';

describe('CookieConfigService', () => {
  let service: CookieConfigService;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getFrontendUrl' | 'getBackendUrl'>>;
  const sessionConfig = { SESSION_COOKIE_MAX_AGE: 86400000 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookieConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === 'session' ? sessionConfig : undefined)),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getFrontendUrl: jest.fn().mockResolvedValue(null),
            getBackendUrl: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<CookieConfigService>(CookieConfigService);
    settingsService = module.get(SettingsService) as typeof settingsService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('returns static config with default sameSite and secure', () => {
      const config = service.getConfig();
      expect(config.name).toBe('auth-session');
      expect(config.httpOnly).toBe(true);
      expect(config.maxAge).toBe(sessionConfig.SESSION_COOKIE_MAX_AGE);
      expect(config.path).toBe('/');
      expect(config.sameSite).toBe('lax');
      expect(config.secure).toBe(false);
    });
  });

  describe('setAuthCookie', () => {
    it('calls res.cookie with secure and sameSite from settings (same-site https)', async () => {
      settingsService.getFrontendUrl.mockResolvedValue('https://app.example.com');
      settingsService.getBackendUrl.mockResolvedValue('https://example.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token-123');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token-123',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: sessionConfig.SESSION_COOKIE_MAX_AGE,
          path: '/',
        }),
      );
    });

    it('calls res.cookie with sameSite lax when sibling subdomains (same base domain)', async () => {
      settingsService.getFrontendUrl.mockResolvedValue('https://app.example.com');
      settingsService.getBackendUrl.mockResolvedValue('https://api.example.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token-789');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token-789',
        expect.objectContaining({
          secure: true,
          sameSite: 'lax',
        }),
      );
    });

    it('calls res.cookie with sameSite none when cross-site and https', async () => {
      settingsService.getFrontendUrl.mockResolvedValue('https://front.vercel.app');
      settingsService.getBackendUrl.mockResolvedValue('https://api.mycompany.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token-456');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token-456',
        expect.objectContaining({
          secure: true,
          sameSite: 'none',
        }),
      );
    });

    it('calls res.cookie with secure false when backend is http', async () => {
      settingsService.getFrontendUrl.mockResolvedValue('http://localhost:4200');
      settingsService.getBackendUrl.mockResolvedValue('http://localhost:3000');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token',
        expect.objectContaining({
          secure: false,
          sameSite: 'lax',
        }),
      );
    });
  });

  describe('clearAuthCookie', () => {
    it('calls res.clearCookie with options derived from settings', async () => {
      settingsService.getFrontendUrl.mockResolvedValue('https://app.example.com');
      settingsService.getBackendUrl.mockResolvedValue('https://example.com');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'auth-session',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });
  });
});
