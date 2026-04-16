import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MetricsGuard } from './metrics.guard';
import { SettingsService } from '../settings/settings.service';
import { TokenHashService } from '../encryption/token-hash.service';

describe('MetricsGuard', () => {
  let guard: MetricsGuard;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getMetricsApiKey'>>;
  let tokenHashService: jest.Mocked<Pick<TokenHashService, 'hashToken'>>;

  function createContext(headers: Record<string, string> = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          query: {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    settingsService = {
      getMetricsApiKey: jest.fn(),
    };
    tokenHashService = {
      hashToken: jest.fn((token: string) => {
        const { createHash } = require('crypto');
        return createHash('sha256').update(token).digest('base64url');
      }),
    };
    guard = new MetricsGuard(
      settingsService as unknown as SettingsService,
      tokenHashService as unknown as TokenHashService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('throws ForbiddenException when metrics endpoint is not configured', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: null, configured: false });
      const context = createContext({ authorization: 'Bearer some-key' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when apiKey is null even if configured flag is true', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: null, configured: true });
      const context = createContext({ authorization: 'Bearer some-key' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when no authorization header is provided', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'test-key', configured: true });
      const context = createContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(context)).rejects.toThrow(/Missing metrics API key/);
    });

    it('throws UnauthorizedException when authorization header is not Bearer', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'test-key', configured: true });
      const context = createContext({ authorization: 'Basic dXNlcjpwYXNz' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when provided key does not match', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'real-key', configured: true });
      const context = createContext({ authorization: 'Bearer wrong-key' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(context)).rejects.toThrow(/Invalid metrics API key/);
    });

    it('returns true when provided key matches the configured key', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'correct-key', configured: true });
      const context = createContext({ authorization: 'Bearer correct-key' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('uses TokenHashService for HMAC-based comparison (not raw string comparison)', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'my-key', configured: true });
      const context = createContext({ authorization: 'Bearer my-key' });

      await guard.canActivate(context);

      expect(tokenHashService.hashToken).toHaveBeenCalledWith('my-key');
      expect(tokenHashService.hashToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('query parameter auth is rejected (secrets must not appear in URLs)', () => {
    it('rejects api_key query parameter even when value is correct', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'test-key', configured: true });
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            query: { api_key: 'test-key' },
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('security: timing-safe comparison (issue #1)', () => {
    it('uses HMAC hashing so different-length keys produce same-length digests', async () => {
      settingsService.getMetricsApiKey.mockResolvedValue({ value: 'short', configured: true });
      const context = createContext({ authorization: 'Bearer a-much-longer-key-that-differs-in-length' });

      const hashCalls: string[] = [];
      tokenHashService.hashToken.mockImplementation((token: string) => {
        hashCalls.push(token);
        return Buffer.from(token).toString('base64url').padEnd(43, 'A').slice(0, 43);
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(hashCalls).toHaveLength(2);
    });
  });
});
