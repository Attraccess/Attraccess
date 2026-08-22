import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ApiTokenRequestRateLimitService } from './api-token-request-rate-limit.service';

describe('ApiTokenRequestRateLimitService', () => {
  it('uses a shared Valkey counter scoped to the API token', async () => {
    const client = { eval: jest.fn().mockResolvedValue([1, 60_000]) } as unknown as Redis;
    const service = new ApiTokenRequestRateLimitService(client);

    await expect(service.assertWithinLimit(1)).resolves.toBeUndefined();

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      'api_token_rate_limit:1',
      60_000,
    );
  });

  it('rejects requests over the shared limit', async () => {
    const client = { eval: jest.fn().mockResolvedValue([1_001, 1_500]) } as unknown as Redis;
    const service = new ApiTokenRequestRateLimitService(client);

    await expect(service.assertWithinLimit(1)).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects API token requests when no shared counter is configured', async () => {
    const service = new ApiTokenRequestRateLimitService(null);

    await expect(service.assertWithinLimit(1)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
