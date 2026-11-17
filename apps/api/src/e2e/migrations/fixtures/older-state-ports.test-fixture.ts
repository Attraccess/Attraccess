import { BillingTransaction, User } from '@attraccess/database-entities';
import type { AuditEntry } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import type { BillingLedgerStore } from '../../../billing/ports/billing-ledger.port';
import { SqliteAuditStore } from '../../../database/adapters/audit/sqlite-audit-store';
import { TypeOrmBillingLedgerStore } from '../../../database/adapters/billing/typeorm-billing-ledger.store';
import { EntityManagerResolver } from '../../../database/adapters/entity-manager-resolver';
import { sqliteBackend } from '../../../database/sqlite/sqlite-backend';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { TransactionContextResolver } from '../../../database/adapters/transaction-context';
import { TypeOrmUsageSessionStore } from '../../../database/adapters/usage/typeorm-usage-session.store';
import type { UsageSessionStore } from '../../../resources/usage/usage-session-store.port';

/**
 * The application's own adapters on an upgraded database. Reading old rows through them, and not only with raw SQL,
 * proves that the mapping of what an older release wrote (dates, booleans, decimals, JSON) still holds.
 */

const unusedAudit: AuditRecorder = {
  record: async () => {
    throw new Error('The upgrade checks only read the ledger');
  },
};

export function ledgerOn(source: DataSource): BillingLedgerStore {
  return new TypeOrmBillingLedgerStore(
    source.getRepository(BillingTransaction),
    source.getRepository(User),
    unusedAudit,
    new TransactionContextResolver(source, unitOfWorkFor(source)),
  );
}

export function usageSessionsOn(source: DataSource): UsageSessionStore {
  return new TypeOrmUsageSessionStore(new EntityManagerResolver(unitOfWorkFor(source), source));
}

/** Every audit entry, newest first, read through the audit store's own durable connection. */
export async function auditEntriesOn(source: DataSource): Promise<AuditEntry[]> {
  const store = new SqliteAuditStore(source);
  expect(await store.open()).toEqual({ status: 'ready' });
  try {
    return (await store.findEntries({ notBefore: new Date(0) }, 100)).entries;
  } finally {
    await store.close();
  }
}

/** What the plugin lifecycle reads from a plugin's own migration table in the upgraded database file. */
export function appliedPluginMigrationsOn(source: DataSource, tableName: string): Promise<string[]> {
  return sqliteBackend.plugins
    .createMigrationEngine({ type: 'sqlite', database: source.options.database as string })
    .listApplied(tableName);
}

/** A UTC timestamp as SQLite stores a `datetime` column: 'YYYY-MM-DD HH:MM:SS'. */
export const utc = (stored: string): Date => new Date(`${stored.replace(' ', 'T')}Z`);
