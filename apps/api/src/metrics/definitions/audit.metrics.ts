// Prometheus metric definitions for audit persistence
// FEATURE: Metrics — audit records that were not stored, by domain and reason
import { Counter, Registry } from 'prom-client';
import { CORE_AUDIT_DOMAINS } from '../../audit/policies/domains';

export const AUDIT_DROP_REASONS = [
  'storage_error',
  'queue_full',
  'storage_unavailable',
  'shutting_down',
  'settings_unavailable',
  'invalid_event',
] as const;
export type AuditDropReason = (typeof AUDIT_DROP_REASONS)[number];

export interface AuditMetrics {
  recordsDropped: Counter<'domain' | 'reason'>;
}

export function createAuditMetrics(registry: Registry): AuditMetrics {
  const recordsDropped = new Counter({
    name: 'attraccess_audit_records_dropped_total',
    help: 'Audit records that were not stored, by audit domain and reason',
    labelNames: ['domain', 'reason'],
    registers: [registry],
  });
  // Create the series up front so increase() sees the first drop.
  for (const domain of [...CORE_AUDIT_DOMAINS, 'unknown']) {
    for (const reason of AUDIT_DROP_REASONS) recordsDropped.labels(domain, reason);
  }
  return { recordsDropped };
}
