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
import type { DataSource } from 'typeorm';
import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import { createTestDatabaseLocation, createTestDataSourceOptions } from '../../../test-utils/test-database';
import { TypeOrmBillingConfigurationStore } from '../../adapters/billing/typeorm-billing-configuration.store';
import { TypeOrmBillingLedgerStore } from '../../adapters/billing/typeorm-billing-ledger.store';
import { TypeOrmSumUpCredentialStore } from '../../adapters/billing/typeorm-sumup-credential.store';
import { TypeOrmPasskeyStore } from '../../adapters/passkeys/typeorm-passkey-store';
import { PostgresSessionStore } from '../../adapters/sessions/postgres-session-store';
import { TransactionContextResolver } from '../../adapters/transaction-context';
import { postgresBackend } from '../../postgres/postgres-backend';
import { postgresFixture } from '../postgres.test-fixture';
import { conformanceTokenHash, PortBackendFixture, PortConnection, PortDatabase } from './port-fixture';

/** Records nothing: the audit store has its own suite; billing only needs a recorder that accepts the event. */
const silentAudit: AuditRecorder = { record: async () => ({}) as never };

function connectPorts(source: DataSource): PortConnection {
  const unitOfWork = postgresBackend.createUnitOfWork(source);
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
    sessions: new PostgresSessionStore(source.getRepository(Session), conformanceTokenHash),
    passkeys: new TypeOrmPasskeyStore(
      source.getRepository(Passkey),
      source.getRepository(PasskeyChallenge),
      source.getRepository(User),
    ),
  };
}

/**
 * The PostgreSQL backend of the port conformance suites: one database cloned from the migrated template, every
 * `connect()` an own DataSource (own pool, own unit of work) on it, the way two API instances meet in production.
 */
export const postgresPortFixture: PortBackendFixture = {
  name: postgresFixture.name,
  concurrentWriters: true,
  async create(): Promise<PortDatabase> {
    const location = await createTestDatabaseLocation();
    const sources: DataSource[] = [];
    const open = async () => {
      const source = postgresBackend.createDataSource(createTestDataSourceOptions({ location: location.location }));
      await source.initialize();
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
        for (const source of sources) if (source.isInitialized) await source.destroy();
        await location.remove();
      },
    };
  },
};
