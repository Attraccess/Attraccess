import { ResourceMaintenanceScheduleTriggerType } from '@attraccess/react-query-client';
export const DURATION_BASIS_OPTIONS = [
  { value: 'SESSION_DURATION', labelKey: 'SESSION_DURATION' },
  { value: 'ATTRIBUTABLE_OPERATING_DURATION', labelKey: 'ATTRIBUTABLE_OPERATING_DURATION' },
] as const;

export const TRIGGER_OPTIONS = [
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_HOURS, labelKey: 'USAGE_HOURS' },
  { value: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT, labelKey: 'USAGE_COUNT' },
  { value: ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL, labelKey: 'TIME_INTERVAL' },
] as const;
