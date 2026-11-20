export enum ResourceMaintenanceScheduleTriggerType {
  USAGE_HOURS = 'USAGE_HOURS',
  USAGE_COUNT = 'USAGE_COUNT',
  /** Recurring (e.g. every N days) or one-off wall-clock threshold (e.g. after N hours since baseline). */
  TIME_INTERVAL = 'TIME_INTERVAL',
}

export enum ResourceMaintenanceScheduleDurationBasis {
  SESSION_DURATION = 'SESSION_DURATION',
  /** All machine operation, including unattributed time. Keep the legacy storage/API value. */
  ATTRIBUTABLE_OPERATING_DURATION = 'ATTRIBUTABLE_OPERATING_DURATION',
}
