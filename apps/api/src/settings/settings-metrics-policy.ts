import { randomBytes } from 'crypto';
import {
  METRICS_KEYS,
  METRICS_PARENT,
  METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS,
  METRICS_TOGGLE_DEFAULTS,
  METRICS_TOGGLE_KEYS,
  MetricsSubsystem,
} from './constants';
import { MetricsTogglesDto } from './dto/metrics-toggles.dto';
import { UpdateMetricsTogglesDto } from './dto/update-metrics-toggles.dto';
import { SettingsRateLimitPolicyImplementation } from './settings-rate-limit-policy';
export abstract class SettingsMetricsPolicyImplementation extends SettingsRateLimitPolicyImplementation {
  async getMetricsApiKey(): Promise<{ value: string | null; configured: boolean }> {
    return this.settingsStore.getSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey);
  }

  async setMetricsApiKey(apiKey: string | null): Promise<void> {
    await this.settingsStore.setSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey, apiKey);
  }

  async generateMetricsApiKey(): Promise<{ apiKey: string }> {
    const apiKey = randomBytes(32).toString('base64url');
    await this.settingsStore.setSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey, apiKey);
    return { apiKey };
  }

  async getMetricsToggles(): Promise<MetricsTogglesDto> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    const reads = await Promise.all(
      subsystems.map(async (subsystem) => {
        const raw = await this.settingsStore.getPlainSetting(METRICS_PARENT, METRICS_TOGGLE_KEYS[subsystem]);
        const value = raw === null || raw === undefined ? METRICS_TOGGLE_DEFAULTS[subsystem] : raw === 'true';
        return [subsystem, value] as const;
      }),
    );
    return reads.reduce<MetricsTogglesDto>((acc, [subsystem, value]) => {
      acc[subsystem] = value;
      return acc;
    }, {} as MetricsTogglesDto);
  }

  async getMetricsSlowQueryThresholdSeconds(): Promise<number> {
    const raw = await this.settingsStore.getPlainSetting(METRICS_PARENT, METRICS_KEYS.slowQueryThresholdSeconds);
    if (raw === null || raw === undefined || raw === '') {
      return METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return METRICS_SLOW_QUERY_THRESHOLD_DEFAULT_SECONDS;
    }
    return parsed;
  }

  async setMetricsSlowQueryThresholdSeconds(value: number): Promise<void> {
    await this.settingsStore.setPlainSetting(METRICS_PARENT, METRICS_KEYS.slowQueryThresholdSeconds, String(value));
    if (this.metricsToggleInvalidator) {
      await this.metricsToggleInvalidator.refresh();
    }
  }

  async updateMetricsToggles(update: UpdateMetricsTogglesDto): Promise<MetricsTogglesDto> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    const writes = subsystems
      .filter((subsystem) => update[subsystem] !== undefined)
      .map((subsystem) =>
        this.settingsStore.setPlainSetting(
          METRICS_PARENT,
          METRICS_TOGGLE_KEYS[subsystem],
          update[subsystem] === true ? 'true' : 'false',
        ),
      );
    await Promise.all(writes);
    if (this.metricsToggleInvalidator) {
      await this.metricsToggleInvalidator.refresh();
    }
    return this.getMetricsToggles();
  }
}
