// Per-subsystem metrics toggle reader with 5s cache to avoid hot-path DB hits
// FEATURE: Metrics — runtime control over per-subsystem timing instrumentation
import { Injectable } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { METRICS_TOGGLE_DEFAULTS, METRICS_TOGGLE_KEYS, MetricsSubsystem } from '../../settings/constants';

interface CachedToggle {
  value: boolean;
  expiresAt: number;
}

const CACHE_TTL_MS = 5000;

@Injectable()
export class MetricsToggleService {
  private readonly cache = new Map<MetricsSubsystem, CachedToggle>();

  constructor(private readonly store: SettingsStoreService) {}

  async isEnabled(subsystem: MetricsSubsystem): Promise<boolean> {
    const cached = this.cache.get(subsystem);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const raw = await this.store.get(METRICS_TOGGLE_KEYS[subsystem]);
    const value = raw === null || raw === undefined ? METRICS_TOGGLE_DEFAULTS[subsystem] : raw === 'true';
    this.cache.set(subsystem, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }
}
