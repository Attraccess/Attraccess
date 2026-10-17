import { describe, expect, it, vi } from 'vitest';
import { ResourceMaintenanceScheduleTriggerType, UsageDurationUnit } from '@attraccess/react-query-client';
import { configSummary } from './config-summary';

const t = vi.fn((key: string, params?: Record<string, number | string>) => {
  return params ? `${key}:${JSON.stringify(params)}` : key;
});

describe('configSummary', () => {
  it('formats USAGE_HOURS in HOURS', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        usageHoursConfig: { duration: 50, unit: UsageDurationUnit.HOURS },
      } as never,
      t,
    );
    expect(result).toBe(
      'configSummary.usageHoursHours:{"duration":50,"durationBasis":"form.durationBasis.SESSION_DURATION"}',
    );
  });

  it('formats USAGE_HOURS with the attributable operating duration basis', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS,
        durationBasis: 'ATTRIBUTABLE_OPERATING_DURATION',
        usageHoursConfig: { duration: 1, unit: UsageDurationUnit.MINUTES },
      } as never,
      t,
    );
    expect(result).toBe(
      'configSummary.usageHoursMinutes:{"duration":1,"durationBasis":"form.durationBasis.ATTRIBUTABLE_OPERATING_DURATION"}',
    );
  });

  it('formats USAGE_COUNT', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
        usageCountConfig: { thresholdSessions: 100 },
      } as never,
      t,
    );
    expect(result).toBe('configSummary.usageCount:{"count":100}');
  });

  it('formats TIME_INTERVAL in DAYS', () => {
    const result = configSummary(
      {
        triggerType: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL,
        timeIntervalConfig: { duration: 7, unit: 'DAYS' },
      } as never,
      t,
    );
    expect(result).toBe('configSummary.timeIntervalDays:{"duration":7}');
  });

  it('returns dash for missing config', () => {
    const result = configSummary({ triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS } as never, t);
    expect(result).toBe('—');
  });
});
