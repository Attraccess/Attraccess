import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { FixedWindowCounterStore, WindowCounterEntry } from '../../common/rate-limiting/fixed-window-counter';
import { MAX_MESSAGE_RATE_COUNTERS, MessageRateLimit, MessageRateLimitScope } from './message-rate-limit.constants';
import { MessageRateLimitExceededException } from './message-rate-limit.exception';

/**
 * Lightweight in-memory, per-user rate limiter for messaging actions.
 *
 * Keyed by `scope:userId` with a fixed window. Counters live in-process (no
 * Redis/DB) via the shared {@link FixedWindowCounterStore} that also backs the
 * auth brute-force protection — sufficient for abuse prevention on a single API
 * instance. The limits themselves are read from the database-backed system
 * settings on each check, so admins can tune them through the settings UI with
 * no restart.
 */
@Injectable()
export class MessageRateLimitService {
  private readonly counters = new FixedWindowCounterStore<string, WindowCounterEntry>(MAX_MESSAGE_RATE_COUNTERS);
  private readonly nowFn: () => number = () => Date.now();

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Records one action for the user within the scope and throws a 429 when the
   * configured limit is exceeded. Call this BEFORE performing the work.
   */
  public async assertWithinLimit(scope: MessageRateLimitScope, userId: number): Promise<void> {
    const limit = await this.resolveLimit(scope);
    const windowMs = limit.windowSeconds * 1000;
    const now = this.nowFn();
    const key = `${scope}:${userId}`;

    this.counters.evict((entry) => now - entry.firstAt >= windowMs);

    const entry = this.counters.get(key);
    if (!entry || now - entry.firstAt >= windowMs) {
      this.counters.set(key, { count: 1, firstAt: now });
      return;
    }

    if (entry.count >= limit.maxActions) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.firstAt + windowMs - now) / 1000));
      throw new MessageRateLimitExceededException(retryAfterSeconds);
    }

    entry.count += 1;
  }

  private async resolveLimit(scope: MessageRateLimitScope): Promise<MessageRateLimit> {
    const policy = await this.settingsService.getMessagingRateLimitPolicy();
    if (scope === 'send_message') {
      return { maxActions: policy.sendMaxPerWindow, windowSeconds: policy.sendWindowSeconds };
    }
    return { maxActions: policy.contactMaxPerWindow, windowSeconds: policy.contactWindowSeconds };
  }
}
