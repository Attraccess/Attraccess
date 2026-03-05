import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CookieConfigService } from './cookie-config.service';
import { SettingsService } from '../../settings/settings.service';
import { Response } from 'express';

describe('CookieConfigService', () => {
  let service: CookieConfigService;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getUrl'>>;

  const sessionConfig = { SESSION_COOKIE_MAX_AGE: 86400000 };

  function buildModule() {
    return Test.createTestingModule({
      providers: [
        CookieConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'session') return sessionConfig;
              return undefined;
            }),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getUrl: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module: TestingModule = await buildModule();
    service = module.get<CookieConfigService>(CookieConfigService);
    settingsService = module.get(SettingsService) as typeof settingsService;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getCookieName ────────────────────────────────────────────────────────

  describe('getCookieName', () => {
    it('returns auth-session', () => {
      expect(service.getCookieName()).toBe('auth-session');
    });

    it('is consistent across multiple calls', () => {
      expect(service.getCookieName()).toBe(service.getCookieName());
    });
  });

  // ─── setAuthCookie ───────────────────────────────────────────────────────

  describe('setAuthCookie', () => {
    it('sets the cookie with the correct name and token', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token-abc');

      expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token-abc', expect.any(Object));
    });

    it('sets httpOnly, sameSite=strict, maxAge, and path', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          maxAge: sessionConfig.SESSION_COOKIE_MAX_AGE,
          path: '/',
        }),
      );
    });

    it('always uses SameSite=Strict', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token',
        expect.objectContaining({ sameSite: 'strict' }),
      );
    });

    describe('secure flag', () => {
      it('is true when settings URL is https', async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ secure: true }));
      });

      it('is false when settings URL is http', async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ secure: false }));
      });

      it('is false when settings URL is null', async () => {
        settingsService.getUrl.mockResolvedValue(null);
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ secure: false }));
      });
    });

    it('fetches URL from settings service on each call', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token');

      expect(settingsService.getUrl).toHaveBeenCalledTimes(1);
    });
  });

  // ─── clearAuthCookie ─────────────────────────────────────────────────────

  describe('clearAuthCookie', () => {
    it('clears the correct cookie name', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.any(Object));
    });

    it('clears with httpOnly, sameSite=strict, and path', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'auth-session',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' }),
      );
    });

    describe('secure flag', () => {
      it('is true when settings URL is https', async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.objectContaining({ secure: true }));
      });

      it('is false when settings URL is http', async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.objectContaining({ secure: false }));
      });
    });

    it('fetches URL from settings service on each call', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(settingsService.getUrl).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Login flow: set + clear use matching options ─────────────────────────

  describe('login flow: set + clear cycle', () => {
    const urls = ['https://prod.example.com', 'http://localhost:3000'] as const;

    for (const url of urls) {
      describe(`url=${url}`, () => {
        beforeEach(() => {
          settingsService.getUrl.mockResolvedValue(url);
        });

        it('set and clear use the same sameSite and secure values', async () => {
          const setCookieSpy = jest.fn();
          const clearCookieSpy = jest.fn();
          const setRes = { cookie: setCookieSpy } as unknown as Response;
          const clearRes = { clearCookie: clearCookieSpy } as unknown as Response;

          await service.setAuthCookie(setRes, 'my-token');
          await service.clearAuthCookie(clearRes);

          const setCall = setCookieSpy.mock.calls[0][2] as { sameSite: string; secure: boolean };
          const clearCall = clearCookieSpy.mock.calls[0][1] as { sameSite: string; secure: boolean };

          expect(setCall.sameSite).toBe('strict');
          expect(clearCall.sameSite).toBe('strict');
          expect(setCall.secure).toBe(clearCall.secure);
        });
      });
    }
  });
});
