// Sliding-window per-IP rate limiter and per-account cooldown helpers
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { Injectable, Logger } from '@nestjs/common';
import { SettingsStoreService } from '../settings/settings-store.service';
import {
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_IP_BUCKET_CAP,
  RATE_LIMIT_KEYS,
  RATE_LIMIT_PARENT,
} from './rate-limit.constants';
import type { RateLimitDecision, RateLimitScope } from './rate-limit.types';

interface ScopeConfig {
  windowSeconds: number;
  maxRequests: number;
}

type IpBucket = Map<string, number[]>;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly buckets = new Map<RateLimitScope, IpBucket>([
    ['login', new Map()],
    ['emailTrigger', new Map()],
    ['tokenAction', new Map()],
  ]);

  constructor(private readonly settingsStore: SettingsStoreService) {}

  async checkIp(scope: RateLimitScope, ip: string): Promise<RateLimitDecision> {
    const config = await this.getScopeConfig(scope);
    const bucket = this.buckets.get(scope) ?? new Map();
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;

    const existing = bucket.get(ip) ?? [];
    const fresh = existing.filter((t) => t > windowStart);

    if (fresh.length >= config.maxRequests) {
      const oldest = fresh[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + config.windowSeconds * 1000 - now) / 1000),
      );
      bucket.set(ip, fresh);
      this.enforceCap(bucket);
      return { allowed: false, retryAfterSeconds };
    }

    fresh.push(now);
    bucket.set(ip, fresh);
    this.enforceCap(bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private enforceCap(bucket: IpBucket): void {
    if (bucket.size <= RATE_LIMIT_IP_BUCKET_CAP) return;
    const overflow = bucket.size - RATE_LIMIT_IP_BUCKET_CAP;
    let removed = 0;
    for (const key of bucket.keys()) {
      if (removed >= overflow) break;
      bucket.delete(key);
      removed += 1;
    }
  }

  private async getScopeConfig(scope: RateLimitScope): Promise<ScopeConfig> {
    switch (scope) {
      case 'login':
        return {
          windowSeconds: await this.readNumber(
            RATE_LIMIT_KEYS.ipLoginWindowSeconds,
            RATE_LIMIT_DEFAULTS.ipLoginWindowSeconds,
          ),
          maxRequests: await this.readNumber(
            RATE_LIMIT_KEYS.ipLoginMaxRequests,
            RATE_LIMIT_DEFAULTS.ipLoginMaxRequests,
          ),
        };
      case 'emailTrigger':
        return {
          windowSeconds: await this.readNumber(
            RATE_LIMIT_KEYS.ipEmailTriggerWindowSeconds,
            RATE_LIMIT_DEFAULTS.ipEmailTriggerWindowSeconds,
          ),
          maxRequests: await this.readNumber(
            RATE_LIMIT_KEYS.ipEmailTriggerMaxRequests,
            RATE_LIMIT_DEFAULTS.ipEmailTriggerMaxRequests,
          ),
        };
      case 'tokenAction':
        return {
          windowSeconds: await this.readNumber(
            RATE_LIMIT_KEYS.ipTokenActionWindowSeconds,
            RATE_LIMIT_DEFAULTS.ipTokenActionWindowSeconds,
          ),
          maxRequests: await this.readNumber(
            RATE_LIMIT_KEYS.ipTokenActionMaxRequests,
            RATE_LIMIT_DEFAULTS.ipTokenActionMaxRequests,
          ),
        };
    }
  }

  private async readNumber(key: string, fallback: number): Promise<number> {
    try {
      const raw = await this.settingsStore.getPlainSetting(
        RATE_LIMIT_PARENT,
        key,
      );
      if (raw === null) return fallback;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Failed to read rate-limit setting ${key}, using default ${fallback}`,
        error as Error,
      );
      return fallback;
    }
  }
}
