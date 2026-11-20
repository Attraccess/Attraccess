// How a connection status reads on the page: one key and one severity per state, shared by the status card, the
// global banner and the Health card, so the same sidecar state looks the same everywhere.
import type { ConnectionStatus, DegradedReason } from './api';

/** The state, or for `degraded` its reason (`unavailable` when the backend sent none). */
export type ConnectionKey = Exclude<ConnectionStatus['state'], 'degraded'> | DegradedReason;

/** Chip colours and alert statuses use the same names. */
export type ConnectionSeverity = 'success' | 'default' | 'accent' | 'warning' | 'danger';

export const connectionKey = (status: ConnectionStatus): ConnectionKey =>
  status.state === 'degraded' ? (status.reason ?? 'unavailable') : status.state;

/** `unavailable` usually heals by itself (warning); the other reasons need the administrator (danger). */
const SEVERITY: Record<ConnectionKey, ConnectionSeverity> = {
  connected: 'success',
  not_configured: 'default',
  connecting: 'accent',
  unavailable: 'warning',
  unauthorized: 'danger',
  incompatible: 'danger',
  misconfigured: 'danger',
};

export const connectionSeverity = (status: ConnectionStatus): ConnectionSeverity => SEVERITY[connectionKey(status)];

// Hints that tell the reader to change the settings or the installation; read-only users, who cannot see the settings,
// are told to ask an administrator instead.
const READ_ONLY_HINTS = new Set([
  'hint.not_configured',
  'hint.unauthorized',
  'hint.unavailable',
  'hint.misconfigured',
  'hint.incompatible',
  'hint.hostVersion',
]);

/** What the administrator can do about the current state, or what a read-only user should expect. */
export function hintKey(status: ConnectionStatus, canManage = true): string {
  const key = baseHintKey(status);
  return !canManage && READ_ONLY_HINTS.has(key) ? `${key}ReadOnly` : key;
}

function baseHintKey(status: ConnectionStatus): string {
  if (status.state !== 'degraded') return `hint.${status.state}`;
  if (status.reasonDetail === 'host version unavailable') return 'hint.hostVersion';
  return `hint.${status.reason ?? 'unavailable'}`;
}
