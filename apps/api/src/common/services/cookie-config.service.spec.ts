import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { CookieConfigService } from './cookie-config.service';
import { SettingsService } from '../../settings/settings.service';
import { Response } from 'express';

// Silence the cookie-security logger fallback warnings
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

describe('CookieConfigService', () => {
  let service: CookieConfigService;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getUrl' | 'getCookieSameSite'>>;

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
            getCookieSameSite: jest.fn().mockResolvedValue('lax'),
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

  // ─── Instantiation ────────────────────────────────────────────────────────

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
      settingsService.getCookieSameSite.mockResolvedValue('lax');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token-abc');

      expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token-abc', expect.any(Object));
    });

    it('sets httpOnly, maxAge, and path', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      settingsService.getCookieSameSite.mockResolvedValue('lax');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token');

      expect(res.cookie).toHaveBeenCalledWith(
        'auth-session',
        'token',
        expect.objectContaining({
          httpOnly: true,
          maxAge: sessionConfig.SESSION_COOKIE_MAX_AGE,
          path: '/',
        }),
      );
    });

    describe('secure flag', () => {
      it('is true when settings URL is https', async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ secure: true }));
      });

      it('is false when settings URL is http', async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ secure: false }));
      });

      it('is false when settings URL is null', async () => {
        settingsService.getUrl.mockResolvedValue(null);
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ secure: false }));
      });
    });

    describe('sameSite policy', () => {
      it("uses 'lax' when policy is lax + https", async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ sameSite: 'lax' }));
      });

      it("uses 'lax' when policy is lax + http", async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ sameSite: 'lax' }));
      });

      it("uses 'strict' when policy is strict + https", async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('strict');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ sameSite: 'strict' }));
      });

      it("uses 'strict' when policy is strict + http (no fallback for strict)", async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        settingsService.getCookieSameSite.mockResolvedValue('strict');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith('auth-session', 'token', expect.objectContaining({ sameSite: 'strict' }));
      });

      it("uses 'none' when policy is none + https (valid combination)", async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('none');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith(
          'auth-session',
          'token',
          expect.objectContaining({ sameSite: 'none', secure: true }),
        );
      });

      it("falls back to 'lax' when policy is none + http (none requires HTTPS)", async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        settingsService.getCookieSameSite.mockResolvedValue('none');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith(
          'auth-session',
          'token',
          expect.objectContaining({ sameSite: 'lax', secure: false }),
        );
      });

      it("falls back to 'lax' when policy is none + null URL", async () => {
        settingsService.getUrl.mockResolvedValue(null);
        settingsService.getCookieSameSite.mockResolvedValue('none');
        const res = { cookie: jest.fn() } as unknown as Response;

        await service.setAuthCookie(res, 'token');

        expect(res.cookie).toHaveBeenCalledWith(
          'auth-session',
          'token',
          expect.objectContaining({ sameSite: 'lax', secure: false }),
        );
      });
    });

    it('fetches both URL and sameSite from settings service on each call', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      settingsService.getCookieSameSite.mockResolvedValue('lax');
      const res = { cookie: jest.fn() } as unknown as Response;

      await service.setAuthCookie(res, 'token');

      expect(settingsService.getUrl).toHaveBeenCalledTimes(1);
      expect(settingsService.getCookieSameSite).toHaveBeenCalledTimes(1);
    });
  });

  // ─── clearAuthCookie ─────────────────────────────────────────────────────

  describe('clearAuthCookie', () => {
    it('clears the correct cookie name', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      settingsService.getCookieSameSite.mockResolvedValue('lax');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.any(Object));
    });

    it('clears with httpOnly and path', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      settingsService.getCookieSameSite.mockResolvedValue('lax');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'auth-session',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    describe('secure flag', () => {
      it('is true when settings URL is https', async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.objectContaining({ secure: true }));
      });

      it('is false when settings URL is http', async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.objectContaining({ secure: false }));
      });
    });

    describe('sameSite policy', () => {
      it("clears with 'lax' when policy is lax", async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('lax');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.objectContaining({ sameSite: 'lax' }));
      });

      it("clears with 'strict' when policy is strict", async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('strict');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith('auth-session', expect.objectContaining({ sameSite: 'strict' }));
      });

      it("clears with 'none' when policy is none + https", async () => {
        settingsService.getUrl.mockResolvedValue('https://app.example.com');
        settingsService.getCookieSameSite.mockResolvedValue('none');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith(
          'auth-session',
          expect.objectContaining({ sameSite: 'none', secure: true }),
        );
      });

      it("falls back to 'lax' when clearing with none + http", async () => {
        settingsService.getUrl.mockResolvedValue('http://localhost:3000');
        settingsService.getCookieSameSite.mockResolvedValue('none');
        const res = { clearCookie: jest.fn() } as unknown as Response;

        await service.clearAuthCookie(res);

        expect(res.clearCookie).toHaveBeenCalledWith(
          'auth-session',
          expect.objectContaining({ sameSite: 'lax', secure: false }),
        );
      });
    });

    it('fetches both URL and sameSite from settings service on each call', async () => {
      settingsService.getUrl.mockResolvedValue('https://app.example.com');
      settingsService.getCookieSameSite.mockResolvedValue('lax');
      const res = { clearCookie: jest.fn() } as unknown as Response;

      await service.clearAuthCookie(res);

      expect(settingsService.getUrl).toHaveBeenCalledTimes(1);
      expect(settingsService.getCookieSameSite).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Login scenario: set + clear cycle for each policy ───────────────────

  describe('login flow: set + clear cycle for each policy', () => {
    const scenarios: Array<{ policy: 'lax' | 'strict' | 'none'; url: string; expectedSameSite: 'lax' | 'strict' | 'none' }> = [
      { policy: 'lax', url: 'https://prod.example.com', expectedSameSite: 'lax' },
      { policy: 'lax', url: 'http://localhost:3000', expectedSameSite: 'lax' },
      { policy: 'strict', url: 'https://prod.example.com', expectedSameSite: 'strict' },
      { policy: 'strict', url: 'http://localhost:3000', expectedSameSite: 'strict' },
      { policy: 'none', url: 'https://prod.example.com', expectedSameSite: 'none' },
      // none + http must fall back to lax
      { policy: 'none', url: 'http://localhost:3000', expectedSameSite: 'lax' },
    ];

    for (const { policy, url, expectedSameSite } of scenarios) {
      describe(`policy=${policy}, url=${url}`, () => {
        beforeEach(() => {
          settingsService.getUrl.mockResolvedValue(url);
          settingsService.getCookieSameSite.mockResolvedValue(policy);
        });

        it(`setAuthCookie uses sameSite=${expectedSameSite}`, async () => {
          const res = { cookie: jest.fn() } as unknown as Response;
          await service.setAuthCookie(res, 'my-token');
          expect(res.cookie).toHaveBeenCalledWith(
            'auth-session',
            'my-token',
            expect.objectContaining({ sameSite: expectedSameSite }),
          );
        });

        it(`clearAuthCookie uses sameSite=${expectedSameSite}`, async () => {
          const res = { clearCookie: jest.fn() } as unknown as Response;
          await service.clearAuthCookie(res);
          expect(res.clearCookie).toHaveBeenCalledWith(
            'auth-session',
            expect.objectContaining({ sameSite: expectedSameSite }),
          );
        });

        it('set and clear use the same sameSite value (cookie can be cleared)', async () => {
          const setCookieSpy = jest.fn();
          const clearCookieSpy = jest.fn();
          const setRes = { cookie: setCookieSpy } as unknown as Response;
          const clearRes = { clearCookie: clearCookieSpy } as unknown as Response;

          await service.setAuthCookie(setRes, 'my-token');
          await service.clearAuthCookie(clearRes);

          const setCall = setCookieSpy.mock.calls[0][2] as { sameSite: string; secure: boolean };
          const clearCall = clearCookieSpy.mock.calls[0][1] as { sameSite: string; secure: boolean };

          expect(setCall.sameSite).toBe(clearCall.sameSite);
          expect(setCall.secure).toBe(clearCall.secure);
        });
      });
    }
  });
});
