// Per-subsystem metrics toggle reader with synchronous cached access for hot paths
// FEATURE: Metrics — runtime control over per-subsystem timing instrumentation
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { METRICS_TOGGLE_DEFAULTS, METRICS_TOGGLE_KEYS, MetricsSubsystem } from '../../settings/constants';

const REFRESH_INTERVAL_MS = 5000;

@Injectable()
export class MetricsToggleService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<MetricsSubsystem, boolean>();
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

  private async runRefresh(): Promise<void> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    const reads = subsystems.map(async (subsystem) => {
      const raw = await this.store.get(METRICS_TOGGLE_KEYS[subsystem]);
      const value = raw === null || raw === undefined ? METRICS_TOGGLE_DEFAULTS[subsystem] : raw === 'true';
      this.cache.set(subsystem, value);
    });
    await Promise.all(reads);
  }
}
