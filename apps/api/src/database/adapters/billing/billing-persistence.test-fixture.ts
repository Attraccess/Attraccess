import {
  BillingTransaction,
  entities,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  Setting,
  User,
} from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import { BillingService } from '../../../billing/charges/billing.service';
import { LiveNotificationsService } from '../../../billing/live-notifications/live-notifications.service';
import * as migrations from '../../migrations';
import { sqliteBackend } from '../../sqlite/sqlite-backend';
import { createSqliteUnitOfWork } from '../../sqlite/sqlite-unit-of-work';
import { ScopedUnitOfWork } from '../../unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TypeOrmBillingConfigurationStore } from './typeorm-billing-configuration.store';
import { TypeOrmBillingLedgerStore } from './typeorm-billing-ledger.store';
import { TypeOrmSumUpCredentialStore } from './typeorm-sumup-credential.store';

/** One connection to the shared database file with the real billing adapters built on it. */
export interface BillingConnection {
  source: DataSource;
  unitOfWork: ScopedUnitOfWork<EntityManager>;
  ledger: TypeOrmBillingLedgerStore;
  configuration: TypeOrmBillingConfigurationStore;
  credentials: TypeOrmSumUpCredentialStore;
  service: BillingService;
  /** Audit events recorded through this connection, with whether they were written inside a transaction. */
  audited: Array<{ operationId?: string; inTransaction: boolean }>;
  mail: { sendResourceUsageBillingSummaryEmail: jest.Mock };
}

/**
 * A fully migrated, file-backed SQLite database that any number of independent connections (own handles, own
 * unit of work) can open, so concurrency guarantees are tested across connections and not on one shared handle.
 */
export async function createBillingDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'billing-persistence-'));
  const file = join(directory, 'billing.sqlite');
  const sources: DataSource[] = [];

  const openSource = async () => {
    const source = await sqliteBackend
      .createDataSource({
        type: 'sqlite',
        database: file,
        entities: Object.values(entities),
        migrations: Object.values(migrations),
      })
      .initialize();
    sources.push(source);
    return source;
  };

  const first = await openSource();
  await first.runMigrations();

  const connect = async (existing?: DataSource): Promise<BillingConnection> => {
    const source = existing ?? (await openSource());
    const unitOfWork = createSqliteUnitOfWork(source);
    const contexts = new TransactionContextResolver(source, unitOfWork);
    const audited: BillingConnection['audited'] = [];
    // Stands in for the audit store: when handed a transaction it writes a row that must commit or roll back with it.
    const audit: AuditRecorder = {
      record: async (event, manager) => {
        audited.push({ operationId: event.operationId, inTransaction: Boolean(manager) });
        await (manager ?? source.manager)
          .getRepository(Setting)
          .insert({ parent: 'audit-probe', key: `${event.operationId}-${audited.length}`, value: event.action });
        return {} as never;
      },
    };
    const ledger = new TypeOrmBillingLedgerStore(
      source.getRepository(BillingTransaction),
      source.getRepository(User),
      audit,
      contexts,
    );
    const configuration = new TypeOrmBillingConfigurationStore(
      source.getRepository(Setting),
      source.getRepository(ResourceBillingConfiguration),
      contexts,
    );
    const credentials = new TypeOrmSumUpCredentialStore(source.getRepository(Setting), contexts);
    const mail = { sendResourceUsageBillingSummaryEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new BillingService(
      ledger,
      configuration,
      new LiveNotificationsService(ledger),
      { getNodes: async () => [] } as never,
      mail as never,
      { emit: jest.fn() } as never,
      { billingTransactionsTotal: { inc: jest.fn() }, billingTransactionAmount: { observe: jest.fn() } } as never,
      audit,
      unitOfWork,
    );
    return { source, unitOfWork, ledger, configuration, credentials, service, audited, mail };
  };

  const seed = async (source: DataSource, name = 'member') => {
    const user = await source.getRepository(User).save({ username: name, email: `${name}@example.test` });
    const resource = await source
      .getRepository(Resource)
      .save({ name: `Lathe of ${name}`, type: ResourceType.Machine });
    return { user, resource };
  };

  const seedUsage = async (
    source: DataSource,
    userId: number,
    resourceId: number,
    overrides: Partial<ResourceUsage> = {},
  ) =>
    source.getRepository(ResourceUsage).save({
      resourceId,
      userId,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-11-13T09:00:00.000Z'),
      endTime: new Date('2026-11-13T09:10:00.000Z'),
      sessionDurationCreditsPerMinute: 2,
      operatingDurationCreditsPerMinute: 0,
      creditsPerUsage: 5,
      ...overrides,
    });

  return {
    primary: first,
    connect: () => connect(first),
    /** A second, independent connection to the same file. */
    connectIndependent: () => connect(),
    seed,
    seedUsage,
    async close() {
      for (const source of sources) {
        await sqliteBackend.shutdown(source);
        if (source.isInitialized) await source.destroy();
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
