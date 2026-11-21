import { createPostgresAuditService } from '../database/adapters/audit/postgres-audit-service.test-fixture';
import {
  AuditLog,
  BillingTransaction,
  BillingTransactionItem,
  Resource,
  ResourceBillingConfiguration,
  ResourceUsage,
  Setting,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  User,
} from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction, SSOProviderType } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { BillingService } from '../billing/charges/billing.service';
import { TransactionContextResolver } from '../database/adapters/transaction-context';
import { TypeOrmBillingConfigurationStore } from '../database/adapters/billing/typeorm-billing-configuration.store';
import { TypeOrmBillingLedgerStore } from '../database/adapters/billing/typeorm-billing-ledger.store';
import { createPostgresUnitOfWork } from '../database/postgres/postgres-unit-of-work';
import { SettingsStoreService } from '../settings/settings-store.service';
import { TypeOrmSsoProviderStore } from '../database/adapters/sso/typeorm-sso-provider-store';
import { SSOService } from '../users-and-auth/auth/sso/sso.service';
import { AuditService } from './audit.service';
import { createTestAuditMetrics, droppedRecords } from '../database/adapters/audit/audit.test-fixture';
import { AuditMetrics } from '../metrics/definitions/audit.metrics';
import { TypeOrmSettingsRows } from '../database/adapters/settings/typeorm-settings-rows';
import { legacyEngineTransactionScope } from '../database/adapters/common/legacy-engine-transaction';
import { createTestDataSource, closeTestDataSource } from '../test-utils/test-database';

/**
 * A service that owns a transactional change records its audit row with the same EntityManager, so the row commits
 * and rolls back with the change. These run the real services against a fully migrated PostgreSQL database
 * and the real audit storage; nothing in the write path is a stand-in.
 */
describe('audit recorded by an owning service inside its transaction', () => {
  let directory: string;
  let source: DataSource;
  let store: SettingsStoreService;
  let metrics: AuditMetrics;
  let audit: AuditService;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'audit-service-transactions-'));
    source = await createTestDataSource();
    store = new SettingsStoreService(TypeOrmSettingsRows.forRepository(source.getRepository(Setting)), null);
    await store.setPlainSetting('audit', 'domains', JSON.stringify(['billing', 'sso']));
  }, 120_000);

  beforeEach(async () => {
    for (const entity of [
      AuditLog,
      BillingTransactionItem,
      BillingTransaction,
      ResourceBillingConfiguration,
      ResourceUsage,
      Resource,
      SSOProviderOIDCConfiguration,
      SSOProviderSAMLConfiguration,
      SSOProvider,
      User,
    ])
      await source.query(`DELETE FROM "${source.getMetadata(entity).tableName}"`);
    metrics = createTestAuditMetrics();
    audit = createPostgresAuditService(source, store, metrics);
    await audit.onModuleInit();
  });

  afterEach(async () => {
    await audit.onModuleDestroy();
  });

  afterAll(async () => {
    await closeTestDataSource(source);
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  /** Every stored column except the generated id and timestamp. */
  const auditRows = async () =>
    (await source.getRepository(AuditLog).find({ order: { id: 'ASC' } })).map(
      ({ id, at, ...row }) => (void id, void at, row),
    );

  describe('billing: starting a usage records the pending charge in the caller transaction', () => {
    let user: User;
    let usage: ResourceUsage;
    let billing: BillingService;

    beforeEach(async () => {
      user = await source.getRepository(User).save({ username: 'Member', email: 'member@example.test' });
      const resource = await source.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine });
      // A usage being started is lifecycle-pending until its start commits.
      usage = await source.getRepository(ResourceUsage).save({
        resourceId: resource.id,
        userId: user.id,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date('2026-11-13T09:00:00.000Z'),
        lifecyclePending: true,
      });
      const unitOfWork = createPostgresUnitOfWork(source);
      const contexts = new TransactionContextResolver(source, unitOfWork);
      billing = new BillingService(
        new TypeOrmBillingLedgerStore(
          source.getRepository(BillingTransaction),
          source.getRepository(User),
          audit,
          contexts,
        ),
        new TypeOrmBillingConfigurationStore(
          source.getRepository(Setting),
          source.getRepository(ResourceBillingConfiguration),
          contexts,
        ),
        {} as never,
        { getNodes: async () => [] } as never,
        {} as never,
        new EventEmitter2(),
        {} as never,
        audit,
        unitOfWork,
      );
    });

    /** The usage-start path: the resource usage service hands its own manager to the billing service. */
    const startUsage = (afterStart: (manager: EntityManager) => Promise<void> = async () => undefined) =>
      source.transaction(async (manager) => {
        await billing.handleResourceUsageStart(usage.resourceId, usage, user, legacyEngineTransactionScope(manager));
        await afterStart(manager);
      });

    it('commits the audit row with the billing transaction', async () => {
      await startUsage();

      const [transaction] = await source.getRepository(BillingTransaction).find();
      expect(transaction).toMatchObject({ userId: user.id, resourceUsageId: usage.id, amount: 0, status: 'pending' });
      expect(await auditRows()).toEqual([
        {
          domain: 'billing',
          pluginId: 'billing',
          action: 'billing.transaction.created',
          operationId: `billing-transaction-${transaction.id}`,
          actorId: user.id,
          authenticationMethod: 'session',
          apiTokenId: null,
          outcome: 'succeeded',
          subjectType: 'billing.transaction',
          subjectId: transaction.id,
          ipAddress: null,
          userAgent: null,
          details: { amount: 0, status: 'pending', source: 'resource-usage' },
        },
      ]);
      expect(await droppedRecords(metrics)).toEqual({});
    });

    it('rolls the audit row back with the billing transaction when the caller fails afterwards', async () => {
      await expect(
        startUsage(async (manager) => {
          // Both writes happened inside the caller's transaction ...
          expect(await manager.count(BillingTransaction)).toBe(1);
          expect(await manager.query('SELECT action FROM audit_log')).toEqual([
            { action: 'billing.transaction.created' },
          ]);
          throw new Error('usage start failed after billing');
        }),
      ).rejects.toThrow('usage start failed after billing');

      // ... and both are gone with it: no orphaned audit row, nothing counted as dropped.
      expect(await source.getRepository(BillingTransaction).count()).toBe(0);
      expect(await auditRows()).toEqual([]);
      expect(await droppedRecords(metrics)).toEqual({});
    });
  });

  describe('sso: a provider change records its audit row in the service transaction', () => {
    const actor = { id: 42, authenticationMethod: 'api-token' as const, apiTokenId: 9 };
    const dto = {
      name: 'Workshop IdP',
      type: SSOProviderType.OIDC,
      oidcConfiguration: {
        issuer: 'https://idp.example.test',
        authorizationURL: 'https://idp.example.test/authorize',
        tokenURL: 'https://idp.example.test/token',
        userInfoURL: 'https://idp.example.test/userinfo',
        clientId: 'workshop',
        clientSecret: 'never-record-this-secret',
        scopes: ['openid', 'email'],
      },
    };
    let sso: SSOService;

    beforeEach(() => {
      sso = new SSOService(
        new TypeOrmSsoProviderStore(source, audit),
        { verifyLicense: async () => undefined } as never,
        {
          encrypt: (value: string) => `enc:${value}`,
          decryptIfEncrypted: (value: string) => value.replace(/^enc:/, ''),
        } as never,
        audit,
      );
    });

    const createdRow = (providerId: number) => ({
      domain: 'sso',
      pluginId: null,
      action: 'sso.provider.created',
      operationId: expect.any(String),
      actorId: 42,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      outcome: 'succeeded',
      subjectType: 'sso.provider',
      subjectId: providerId,
      ipAddress: null,
      userAgent: null,
      details: {
        before: 'null',
        after: JSON.stringify({
          id: providerId,
          name: 'Workshop IdP',
          type: 'oidc',
          configuration: {
            issuer: 'https://idp.example.test/',
            authorizationURL: 'https://idp.example.test/authorize',
            tokenURL: 'https://idp.example.test/token',
            userInfoURL: 'https://idp.example.test/userinfo',
            clientId: 'workshop',
            clientSecretConfigured: true,
            scopes: ['openid', 'email'],
            usernameClaimPaths: null,
            emailClaimPaths: null,
            roleClaimPaths: null,
            firstNameClaimPath: null,
            lastNameClaimPath: null,
            roleMappings: null,
            omitted: {},
          },
        }),
      },
    });

    it('commits the audit row with the created provider', async () => {
      const provider = await sso.createProvider(dto as never, actor);

      expect(await source.getRepository(SSOProvider).count()).toBe(1);
      expect(await auditRows()).toEqual([createdRow(provider.id)]);
      expect(JSON.stringify(await auditRows())).not.toContain('never-record-this-secret');
    });

    it('rolls the audit row back with the provider when the transaction fails after the audit was recorded', async () => {
      const record = audit.record.bind(audit);
      let recordedInTransaction = false;
      const spy = jest.spyOn(audit, 'record').mockImplementation(async (...args) => {
        await record(...args);
        recordedInTransaction = args[1] !== undefined;
        throw new Error('enclosing work failed');
      });
      try {
        await expect(sso.createProvider(dto as never, actor)).rejects.toThrow('enclosing work failed');
      } finally {
        spy.mockRestore();
      }

      // The audit row was written through the service transaction's scope, so it went down with the provider.
      expect(recordedInTransaction).toBe(true);
      expect(await source.getRepository(SSOProvider).count()).toBe(0);
      expect(await source.getRepository(SSOProviderOIDCConfiguration).count()).toBe(0);
      expect(await auditRows()).toEqual([]);
      expect(await droppedRecords(metrics)).toEqual({});
    });
  });
});
