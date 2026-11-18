import { BillingTransaction, User } from '@attraccess/database-entities';
import type { AuditEntry } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import type { BillingLedgerStore } from '../../../billing/ports/billing-ledger.port';
import { SqliteAuditStore } from '../../../database/adapters/audit/sqlite-audit-store';
import { TypeOrmBillingLedgerStore } from '../../../database/adapters/billing/typeorm-billing-ledger.store';
import { EntityManagerResolver } from '../../../database/adapters/entity-manager-resolver';
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

/**
 * The names in a plugin's legacy (1.x TypeORM) migration table of the upgraded database file, newest first. The
 * plugin lifecycle reads the same table to adopt the plugin's tables as the baseline of its neutral migrations.
 */
export async function appliedPluginMigrationsOn(source: DataSource, tableName: string): Promise<string[]> {
  const rows: Array<{ name: string }> = await source.query(`SELECT "name" FROM "${tableName}" ORDER BY "id" DESC`);
  return rows.map(({ name }) => name);
}

/** A UTC timestamp as SQLite stores a `datetime` column: 'YYYY-MM-DD HH:MM:SS'. */
export const utc = (stored: string): Date => new Date(`${stored.replace(' ', 'T')}Z`);
