import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { FixedWindowCounterStore, WindowCounterEntry } from '../../../common/rate-limiting/fixed-window-counter';

const MAX_COUNTERS = 50_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 1_000;

@Injectable()
export class ApiTokenRequestRateLimitService {
  private readonly counters = new FixedWindowCounterStore<number, WindowCounterEntry>(MAX_COUNTERS);

  assertWithinLimit(apiTokenId: number): void {
    const now = Date.now();
    this.counters.evict((entry) => now - entry.firstAt >= WINDOW_MS);

    const entry = this.counters.get(apiTokenId);
    if (!entry || now - entry.firstAt >= WINDOW_MS) {
      this.counters.set(apiTokenId, { count: 1, firstAt: now });
      return;
    }

    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.firstAt + WINDOW_MS - now) / 1000));
      throw new HttpException(
        { message: 'API token rate limit exceeded', retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
  }
}
