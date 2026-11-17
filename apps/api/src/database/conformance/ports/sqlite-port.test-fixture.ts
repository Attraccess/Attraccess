import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BillingTransaction,
  Passkey,
  PasskeyChallenge,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  Session,
  Setting,
  User,
} from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { DataSource, DataSourceOptions } from 'typeorm';
import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import { TypeOrmBillingConfigurationStore } from '../../adapters/billing/typeorm-billing-configuration.store';
import { TypeOrmBillingLedgerStore } from '../../adapters/billing/typeorm-billing-ledger.store';
import { TypeOrmSumUpCredentialStore } from '../../adapters/billing/typeorm-sumup-credential.store';
import { TypeOrmPasskeyStore } from '../../adapters/passkeys/typeorm-passkey-store';
import { SqliteSessionStore } from '../../adapters/sessions/sqlite-session-store';
import { TransactionContextResolver } from '../../adapters/transaction-context';
import { sqliteBackend } from '../../sqlite/sqlite-backend';
import { createSqliteUnitOfWork } from '../../sqlite/sqlite-unit-of-work';
import { sqliteFixture } from '../sqlite.test-fixture';
import { conformanceTokenHash, PortBackendFixture, PortConnection, PortDatabase } from './port-fixture';

/** Records nothing: the audit store has its own suite; billing only needs a recorder that accepts the event. */
const silentAudit: AuditRecorder = { record: async () => ({}) as never };

function connectPorts(source: DataSource): PortConnection {
  const unitOfWork = createSqliteUnitOfWork(source);
  const contexts = new TransactionContextResolver(source, unitOfWork);
  return {
    unitOfWork,
    audit: silentAudit,
    billingLedger: new TypeOrmBillingLedgerStore(
      source.getRepository(BillingTransaction),
      source.getRepository(User),
      silentAudit,
      contexts,
    ),
    billingConfiguration: new TypeOrmBillingConfigurationStore(
      source.getRepository(Setting),
      source.getRepository(ResourceBillingConfiguration),
      contexts,
    ),
    sumUpCredentials: new TypeOrmSumUpCredentialStore(source.getRepository(Setting), contexts),
    sessions: new SqliteSessionStore(source.getRepository(Session), conformanceTokenHash),
    passkeys: new TypeOrmPasskeyStore(
      source.getRepository(Passkey),
      source.getRepository(PasskeyChallenge),
      source.getRepository(User),
    ),
  };
}

export const openSqlite = (file: string) =>
  sqliteBackend
    .createDataSource({
      type: 'sqlite',
      database: file,
      entities: sqliteBackend.entities,
      migrations: sqliteBackend.migrationTrack.migrations,
      migrationsTableName: sqliteBackend.migrationTrack.tableName,
    } as DataSourceOptions)
    .initialize();

let template: Promise<string> | undefined;

/** Runs the released migration track once per test process; every database starts as a copy of that file. */
export function migratedTemplate(): Promise<string> {
  template ??= (async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'port-conformance-template-')), 'template.sqlite');
    const source = await openSqlite(file);
    try {
      await source.runMigrations();
    } finally {
      await sqliteBackend.shutdown(source);
      await source.destroy();
    }
    return file;
  })();
  return template;
}

/** Removes the template file of this test process; call it once after the last suite of a spec file. */
export async function removeSqlitePortTemplate(): Promise<void> {
  const pending = template;
  template = undefined;
  if (pending) await rm(dirname(await pending), { recursive: true, force: true });
}

/**
 * The SQLite backend of the port conformance suites: one migrated database file, every `connect()` an own
 * DataSource (own handle, own unit of work and write queue) on it, the way two API instances meet in production.
 */
export const sqlitePortFixture: PortBackendFixture = {
  name: sqliteFixture.name,
  concurrentWriters: false,
  async create(): Promise<PortDatabase> {
    const directory = await mkdtemp(join(tmpdir(), 'port-conformance-'));
    const file = join(directory, 'ports.sqlite');
    await copyFile(await migratedTemplate(), file);
    const sources: DataSource[] = [];
    const open = async () => {
      const source = await openSqlite(file);
      sources.push(source);
      return source;
    };
    const primary = await open();

    return {
      connect: async () => connectPorts(await open()),
      async seedMember(name) {
        const user = await primary.getRepository(User).save({ username: name, email: `${name}@example.test` });
        const resource = await primary
          .getRepository(Resource)
          .save({ name: `Lathe of ${name}`, type: ResourceType.Machine });
        return { userId: user.id, resourceId: resource.id };
      },
      async seedFinishedUsage({ userId, resourceId }) {
        const usage = await primary.getRepository(ResourceUsage).save({
          resourceId,
          userId,
          usageAction: ResourceUsageAction.Usage,
          startTime: new Date('2026-11-13T09:00:00.000Z'),
          endTime: new Date('2026-11-13T09:10:00.000Z'),
          sessionDurationCreditsPerMinute: 2,
          operatingDurationCreditsPerMinute: 0,
          creditsPerUsage: 5,
        });
        return usage.id;
      },
      countUsageTransactions: (usageId) =>
        primary.getRepository(BillingTransaction).countBy({ resourceUsageId: usageId }),
      countUserTransactions: (userId) => primary.getRepository(BillingTransaction).countBy({ userId }),
      countSettings: (parent) => primary.getRepository(Setting).countBy({ parent }),
      async sessionTokens(userId) {
        return (await primary.getRepository(Session).findBy({ userId })).map((session) => session.token).sort();
      },
      async close() {
        for (const source of sources) {
          await sqliteBackend.shutdown(source);
          if (source.isInitialized) await source.destroy();
        }
        await rm(directory, { recursive: true, force: true });
      },
    };
  },
};
