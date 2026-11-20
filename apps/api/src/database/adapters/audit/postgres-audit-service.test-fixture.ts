import type { DataSource } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import type { AuditMetrics } from '../../../metrics/definitions/audit.metrics';
import type { SettingsStoreService } from '../../../settings/settings-store.service';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { PostgresAuditStore } from './postgres-audit-store';

/** An AuditService on the PostgreSQL audit store of the given main connection (tests and standalone wiring). */
export function createPostgresAuditService(
  source: DataSource,
  settings: SettingsStoreService,
  metrics: AuditMetrics,
): AuditService {
  // The application's one unit of work of this connection, so scopes of other adapters resolve here too.
  return new AuditService(new PostgresAuditStore(source, unitOfWorkFor(source)), settings, metrics);
}

/** The dedicated durable audit connection behind a service built with the PostgreSQL audit store (tests spy on it). */
export function auditConnectionOf(service: AuditService): DataSource {
  const store = (service as unknown as { store: { storage?: DataSource } }).store;
  if (!store.storage) throw new Error('The audit connection is not open');
  return store.storage;
}
