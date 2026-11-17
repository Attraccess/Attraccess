import type { DataSource } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import type { AuditMetrics } from '../../../metrics/definitions/audit.metrics';
import type { SettingsStoreService } from '../../../settings/settings-store.service';
import { SqliteAuditStore } from './sqlite-audit-store';

/** An AuditService on the SQLite audit store of the given main connection (tests and standalone wiring). */
export function createSqliteAuditService(
  source: DataSource,
  settings: SettingsStoreService,
  metrics: AuditMetrics,
): AuditService {
  return new AuditService(new SqliteAuditStore(source), settings, metrics);
}

/** The dedicated durable audit connection behind a service built with the SQLite audit store (tests spy on it). */
export function auditConnectionOf(service: AuditService): DataSource {
  const store = (service as unknown as { store: { storage?: DataSource } }).store;
  if (!store.storage) throw new Error('The audit connection is not open');
  return store.storage;
}
