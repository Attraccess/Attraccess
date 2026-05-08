// Per-subsystem metrics toggle reader with synchronous cached access for hot paths
// FEATURE: Metrics — runtime control over per-subsystem timing instrumentation
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/settings-store.service';
import {
  METRICS_KEYS,
  METRICS_PARENT,
  METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
  METRICS_TOGGLE_DEFAULTS,
  METRICS_TOGGLE_KEYS,
  MetricsSubsystem,
} from '../../settings/constants';

const REFRESH_INTERVAL_MS = 5000;

@Injectable()
export class MetricsToggleService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<MetricsSubsystem, boolean>();
  private slowQueryThresholdSeconds: number = METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly store: SettingsStoreService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  isEnabledCached(subsystem: MetricsSubsystem): boolean {
    const cached = this.cache.get(subsystem);
    if (cached === undefined) {
      return METRICS_TOGGLE_DEFAULTS[subsystem];
    }
    return cached;
  }

  async isEnabled(subsystem: MetricsSubsystem): Promise<boolean> {
    await this.refresh();
    return this.isEnabledCached(subsystem);
  }

  refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.runRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  invalidate(): void {
    this.cache.clear();
    this.slowQueryThresholdSeconds = METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
  }

  getSlowQueryThresholdSecondsCached(): number {
    return this.slowQueryThresholdSeconds;
  }

  private async runRefresh(): Promise<void> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    const toggleReads = subsystems.map(async (subsystem) => {
      const raw = await this.store.getPlainSetting(METRICS_PARENT, METRICS_TOGGLE_KEYS[subsystem]);
      const value = raw === null || raw === undefined ? METRICS_TOGGLE_DEFAULTS[subsystem] : raw === 'true';
      this.cache.set(subsystem, value);
    });
    const thresholdRead = this.store
      .getPlainSetting(METRICS_PARENT, METRICS_KEYS.slowQueryThresholdSeconds)
      .then((raw) => {
        this.slowQueryThresholdSeconds = parseSlowQueryThreshold(raw);
      });
    await Promise.all([...toggleReads, thresholdRead]);
  }
}

function parseSlowQueryThreshold(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
  return parsed;
}
