import {
  BillingTransaction,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  Setting,
  User,
} from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import { BillingService } from '../../../billing/charges/billing.service';
import { LiveNotificationsService } from '../../../billing/live-notifications/live-notifications.service';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
} from '../../../test-utils/test-database';
import type { ScopedUnitOfWork } from '../../unit-of-work';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TypeOrmBillingConfigurationStore } from './typeorm-billing-configuration.store';
import { TypeOrmBillingLedgerStore } from './typeorm-billing-ledger.store';
import { TypeOrmSumUpCredentialStore } from './typeorm-sumup-credential.store';

/** One connection to the shared database with the real billing adapters built on it. */
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
 * A PostgreSQL database built by the released migration track that any number of independent connections (own pools,
 * own unit of work) can open, so concurrency guarantees are tested across connections and not on one shared handle.
 * `close` drops it.
 */
export async function createBillingDatabase() {
  const database = await createTestDatabaseLocation();
  const sources: DataSource[] = [];

  const openSource = async () => {
    const source = await createTestDataSource({ location: database.location });
    sources.push(source);
    return source;
  };

  const first = await openSource();

  const connect = async (existing?: DataSource): Promise<BillingConnection> => {
    const source = existing ?? (await openSource());
    const unitOfWork = unitOfWorkFor(source);
    const contexts = new TransactionContextResolver(source, unitOfWork);
    const audited: BillingConnection['audited'] = [];
    // Stands in for the audit store: when handed a transaction it writes a row that must commit or roll back with it.
    const audit: AuditRecorder = {
      record: async (event, scope) => {
        audited.push({ operationId: event.operationId, inTransaction: Boolean(scope) });
        await contexts
          .manager(scope)
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
    /** A second, independent connection to the same database. */
    connectIndependent: () => connect(),
    seed,
    seedUsage,
    async close() {
      for (const source of sources.splice(0)) await closeTestDataSource(source);
      await database.remove();
    },
  };
}
