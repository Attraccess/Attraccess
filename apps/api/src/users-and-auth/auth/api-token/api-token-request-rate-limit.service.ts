import { HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { VALKEY_CLIENT } from '../../../valkey/valkey.module';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 1_000;
const COUNTER_KEY_PREFIX = 'api_token_rate_limit:';
const INCREMENT_COUNTER_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

@Injectable()
export class ApiTokenRequestRateLimitService {
  constructor(@Inject(VALKEY_CLIENT) private readonly client: Redis | null) {}

  async assertWithinLimit(apiTokenId: number): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableException('API token requests require Valkey');
    }

    const [count, remainingMs] = (await this.client.eval(
      INCREMENT_COUNTER_SCRIPT,
      1,
      `${COUNTER_KEY_PREFIX}${apiTokenId}`,
      WINDOW_MS,
    )) as [number, number];

    if (count > MAX_REQUESTS_PER_WINDOW) {
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      throw new HttpException(
        { message: 'API token rate limit exceeded', retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
