import {
  AuditLog,
  BillingTransaction,
  BillingTransactionItem,
  entities,
  Resource,
  ResourceBillingConfiguration,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  Setting,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProviderType,
  User,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { BillingService } from '../billing/charges/billing.service';
import * as migrations from '../database/migrations';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SSOService } from '../users-and-auth/auth/sso/sso.service';
import { AuditService } from './audit.service';
import { createTestAuditMetrics, droppedRecords } from './audit.test-fixture';
import { AuditMetrics } from '../metrics/definitions/audit.metrics';

/**
 * A service that owns a transactional change records its audit row with the same EntityManager, so the row commits
 * and rolls back with the change. These run the real services against a fully migrated, file-backed SQLite database
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
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'audit.sqlite'),
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    store = new SettingsStoreService(source.getRepository(Setting), null);
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
    audit = new AuditService(source, store, metrics);
    await audit.onModuleInit();
  });

  afterEach(async () => {
    await audit.onModuleDestroy();
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
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
      billing = new BillingService(
        source.getRepository(BillingTransaction),
        source.getRepository(User),
        source.getRepository(ResourceBillingConfiguration),
        {} as never,
        source.getRepository(Setting),
        source.getRepository(BillingTransactionItem),
        { getNodes: async () => [] } as never,
        {} as never,
        new EventEmitter2(),
        {} as never,
        audit,
      );
    });

    /** The usage-start path: the resource usage service hands its own manager to the billing service. */
    const startUsage = (afterStart: (manager: EntityManager) => Promise<void> = async () => undefined) =>
      source.transaction(async (manager) => {
        await billing.handleResourceUsageStart(usage.resourceId, usage, user, manager);
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
        source.getRepository(SSOProvider),
        source.getRepository(SSOProviderOIDCConfiguration),
        source.getRepository(SSOProviderSAMLConfiguration),
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

    it('rolls the audit row back with the provider when the enclosing transaction fails', async () => {
      let createdId = 0;
      await expect(
        source.transaction(async (manager) => {
          // The service's own transaction runs as a savepoint of this one (one SQLite connection).
          createdId = (await sso.createProvider(dto as never, actor)).id;
          expect(await manager.query('SELECT action FROM audit_log')).toEqual([{ action: 'sso.provider.created' }]);
          throw new Error('enclosing work failed');
        }),
      ).rejects.toThrow('enclosing work failed');

      expect(createdId).toBeGreaterThan(0);
      expect(await source.getRepository(SSOProvider).count()).toBe(0);
      expect(await source.getRepository(SSOProviderOIDCConfiguration).count()).toBe(0);
      expect(await auditRows()).toEqual([]);
      expect(await droppedRecords(metrics)).toEqual({});
    });
  });
});
