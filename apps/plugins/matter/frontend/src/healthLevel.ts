// Levels of the health overview and of the reconciliation outcome, shared by the Health cards and the Devices tab.
import type { ConnectionSeverity } from './connectionStatus';
import type { ReconciliationStatus } from './devices/api';

export type HealthLevel = 'ok' | 'warning' | 'danger' | 'unknown';

/** The chip colour of a level. */
export const HEALTH_LEVEL_COLOR = { ok: 'success', warning: 'warning', danger: 'danger', unknown: 'default' } as const;

const RECONCILIATION_LEVEL: Record<NonNullable<ReconciliationStatus['lastResult']>, HealthLevel> = {
  applied: 'ok',
  skipped_unavailable: 'warning',
  skipped_non_authoritative: 'warning',
  failed: 'danger',
};

/** The level of the last reconciliation's outcome; `unknown` when none ran yet or it is not loaded. */
export const reconciliationLevel = (result: ReconciliationStatus['lastResult'] | undefined): HealthLevel =>
  result ? RECONCILIATION_LEVEL[result] : 'unknown';

/** The health level of a connection severity: not configured and connecting are neither healthy nor failing. */
export const connectionHealthLevel = (severity: ConnectionSeverity): HealthLevel =>
  severity === 'success' ? 'ok' : severity === 'warning' ? 'warning' : severity === 'danger' ? 'danger' : 'unknown';
