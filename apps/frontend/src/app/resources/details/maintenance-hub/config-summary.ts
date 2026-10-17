// Pure function summarising a maintenance schedule config as a translated string
// FEATURE: Maintenance Hub - config summary util for schedule display
import { ResourceMaintenanceSchedule, ResourceMaintenanceScheduleTriggerType } from '@attraccess/react-query-client';

type Translator = (key: string, params?: Record<string, number | string>) => string;

export function configSummary(schedule: ResourceMaintenanceSchedule, t: Translator): string {
  switch (schedule.triggerType) {
    case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
      const config = schedule.usageHoursConfig as { duration: number; unit: string } | undefined;
      if (!config) return '—';
      const key =
        config.unit === 'MINUTES'
          ? 'configSummary.usageHoursMinutes'
          : config.unit === 'HOURS'
            ? 'configSummary.usageHoursHours'
            : 'configSummary.usageHoursDays';
      const durationBasis = (schedule as { durationBasis?: string }).durationBasis ?? 'SESSION_DURATION';
      return t(key, {
        duration: config.duration,
        durationBasis: t(`form.durationBasis.${durationBasis}`),
      });
    }
    case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
      return schedule.usageCountConfig
        ? t('configSummary.usageCount', { count: schedule.usageCountConfig.thresholdSessions })
        : '—';
    case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
      const config = schedule.timeIntervalConfig as { duration?: number; unit?: string } | undefined;
      if (!config || config.duration == null) return '—';
      const key =
        config.unit === 'MINUTES'
          ? 'configSummary.timeIntervalMinutes'
          : config.unit === 'HOURS'
            ? 'configSummary.timeIntervalHours'
            : 'configSummary.timeIntervalDays';
      return t(key, { duration: config.duration });
    }
    default:
      return '—';
  }
}
