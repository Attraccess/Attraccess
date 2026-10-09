import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as migrations from '../database/migrations';
import { DurableAudit1783700000000 } from '../database/migrations/1783700000000-durable-audit';
import { IdentityAudit1783800000000 } from '../database/migrations/1783800000000-identity-audit';
import { RetirePasswordPolicyAudit1783900000000 } from '../database/migrations/1783900000000-retire-password-policy-audit';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { readAuditSettings } from './audit.config';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { setupAuditDatabase } from './audit.test-fixture';
describe('durable audit SQLite', () => {
  const fixture = setupAuditDatabase();
  it('upgrades additively, survives connection restart and principal deletion, prevents updates, and reverts', async () => {
    expect(await fixture.source.query('SELECT * FROM role_permission')).toEqual([
      { roleId: 1, permissionKey: 'system.audit.read' },
    ]);
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
    await expect(fixture.source.query("UPDATE audit_log SET outcome = 'failed'")).rejects.toThrow('immutable');
    expect(await fixture.source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    await fixture.source.query('DELETE FROM role WHERE id = 1');
    await fixture.service.onModuleDestroy();
    await fixture.source.destroy();
    await fixture.source.initialize();
    await fixture.source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    fixture.store = new SettingsStoreService(fixture.source.getRepository(Setting), null);
    fixture.service = new AuditService(fixture.source, fixture.store);
    await fixture.service.onModuleInit();
    expect((await fixture.service.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({ actorId: 42, details: { revision: 2 } }),
    ]);
    await fixture.service.onModuleDestroy();
    await fixture.identityMigration.down(fixture.source.createQueryRunner());
    await fixture.migration.down(fixture.source.createQueryRunner());
    expect(await fixture.source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect(await fixture.source.query('SELECT * FROM permission')).toEqual([]);
    expect(await fixture.source.query('SELECT * FROM role')).toEqual([{ id: 2, key: 'member' }]);
    await fixture.migration.up(fixture.source.createQueryRunner());
    await fixture.identityMigration.up(fixture.source.createQueryRunner());
  });

  it('preserves shared audit rows through identity downgrade and re-upgrade', async () => {
    const rows = [
      [
        901,
        'resource',
        null,
        'resource.usage_auto_closed',
        '00000000-0000-4000-8000-000000000901',
        null,
        null,
        null,
        'resource.usage',
        11,
        null,
        null,
      ],
      [
        902,
        'demo',
        'abcdefghijklmnopqrstu',
        'demo.device_connected',
        '00000000-0000-4000-8000-000000000902',
        42,
        'api_token',
        7,
        'demo.device',
        12,
        '192.0.2.42',
        'Demo/1.0',
      ],
      [
        903,
        'resource',
        null,
        'resource.maintenance_started',
        '00000000-0000-4000-8000-000000000903',
        null,
        null,
        null,
        'resource.maintenance',
        13,
        '2001:db8::3',
        'Resource worker/1.0',
      ],
    ];

    for (const row of rows) {
      await fixture.source.query(
        `INSERT INTO "audit_log" ("id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "ipAddress", "userAgent", "details")
         VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, '{"source":"migration-test"}')`,
        row,
      );
    }

    await fixture.identityMigration.down(fixture.source.createQueryRunner());
    await fixture.identityMigration.up(fixture.source.createQueryRunner());

    expect(
      await fixture.source
        .query(`SELECT "id", "pluginId", "actorId", "authenticationMethod", "apiTokenId", "ipAddress", "userAgent"
        FROM "audit_log" WHERE "id" IN (901, 902, 903) ORDER BY "id"`),
    ).toEqual([
      {
        id: 901,
        pluginId: null,
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        ipAddress: null,
        userAgent: null,
      },
      {
        id: 902,
        pluginId: 'abcdefghijklmnopqrstu',
        actorId: 42,
        authenticationMethod: 'api_token',
        apiTokenId: 7,
        ipAddress: '192.0.2.42',
        userAgent: 'Demo/1.0',
      },
      {
        id: 903,
        pluginId: null,
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        ipAddress: '2001:db8::3',
        userAgent: 'Resource worker/1.0',
      },
    ]);
    expect(
      (await fixture.source.query('PRAGMA index_list(audit_log)')).map(({ name }: { name: string }) => name),
    ).toEqual(
      expect.arrayContaining([
        'IDX_audit_log_at',
        'IDX_audit_log_domain_id',
        'IDX_audit_log_actor_id',
        'IDX_audit_log_subject_id',
        'IDX_audit_log_operation_id',
        'IDX_audit_log_domain_at',
      ]),
    );
    await expect(fixture.source.query("UPDATE audit_log SET outcome = 'failed' WHERE id = 901")).rejects.toThrow(
      'immutable',
    );
  });

  it('never acknowledges or persists an event in an originating transaction that rolls back', async () => {
    const runner = fixture.source.createQueryRunner();
    await runner.startTransaction();
    const receipt = fixture.service.record(fixture.event());
    await runner.rollbackTransaction();
    expect(await receipt).toEqual({ status: 'unavailable' });
    expect((await fixture.service.list(new AuditQueryDto())).items).toHaveLength(0);
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
  });

  it('records a billing event only after its originating transaction commits', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let receipt: Promise<{ status: string }> | undefined;
    await fixture.source.transaction(async (manager) => {
      receipt = fixture.service.recordBillingTransactionAfterCommit(
        {
          transactionId: 8,
          userId: 42,
          amount: 0,
          status: 'pending',
          source: 'resource-usage',
        },
        manager,
      );
      expect((await fixture.service.list({ limit: 1 })).items).toHaveLength(0);
    });
    await expect(receipt).resolves.toEqual({ status: 'recorded' });
    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({ subjectId: 8, domain: 'billing' });
  });

  it('discards a billing event when its originating transaction rolls back', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let receipt: Promise<{ status: string }> | undefined;
    await expect(
      fixture.source.transaction(async (manager) => {
        receipt = fixture.service.recordBillingTransactionAfterCommit(
          {
            transactionId: 8,
            userId: 42,
            amount: 0,
            status: 'pending',
            source: 'resource-usage',
          },
          manager,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(receipt).resolves.toEqual({ status: 'unavailable' });
    expect((await fixture.service.list({ limit: 1 })).items).toHaveLength(0);
  });

  it('retains outer billing events when a nested transaction rolls back', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let outerReceipt: Promise<{ status: string }> | undefined;
    let nestedReceipt: Promise<{ status: string }> | undefined;
    await fixture.source.transaction(async (manager) => {
      outerReceipt = fixture.service.recordBillingTransactionAfterCommit(
        {
          transactionId: 8,
          userId: 42,
          amount: 0,
          status: 'pending',
          source: 'resource-usage',
        },
        manager,
      );
      await expect(
        manager.transaction(async (nestedManager) => {
          nestedReceipt = fixture.service.recordBillingTransactionAfterCommit(
            {
              transactionId: 9,
              userId: 42,
              amount: 0,
              status: 'pending',
              source: 'resource-usage',
            },
            nestedManager,
          );
          throw new Error('nested rollback');
        }),
      ).rejects.toThrow('nested rollback');
    });
    await expect(outerReceipt).resolves.toEqual({ status: 'recorded' });
    await expect(nestedReceipt).resolves.toEqual({ status: 'unavailable' });
    expect((await fixture.service.list({ limit: 10 })).items.map((item) => item.subjectId)).toEqual([8]);
  });

  it('retains billing events from a committed savepoint when a sibling savepoint rolls back', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let committedReceipt: Promise<{ status: string }> | undefined;
    let rolledBackReceipt: Promise<{ status: string }> | undefined;
    await fixture.source.transaction(async (manager) => {
      await manager.transaction(async (nestedManager) => {
        committedReceipt = fixture.service.recordBillingTransactionAfterCommit(
          {
            transactionId: 8,
            userId: 42,
            amount: 0,
            status: 'pending',
            source: 'resource-usage',
          },
          nestedManager,
        );
      });
      await expect(
        manager.transaction(async (nestedManager) => {
          rolledBackReceipt = fixture.service.recordBillingTransactionAfterCommit(
            {
              transactionId: 9,
              userId: 42,
              amount: 0,
              status: 'pending',
              source: 'resource-usage',
            },
            nestedManager,
          );
          throw new Error('nested rollback');
        }),
      ).rejects.toThrow('nested rollback');
    });
    await expect(committedReceipt).resolves.toEqual({ status: 'recorded' });
    await expect(rolledBackReceipt).resolves.toEqual({ status: 'unavailable' });
    expect((await fixture.service.list({ limit: 10 })).items.map((item) => item.subjectId)).toEqual([8]);
  });

  it('filters and paginates without duplication; hides expired rows and cleans them', async () => {
    await fixture.service.record(fixture.event());
    await fixture.service.record({ ...fixture.event(), outcome: 'failed' });
    await fixture.service.record(fixture.event());
    const page = await fixture.service.list({ limit: 1 });
    expect(page.nextCursor).toBe(3);
    expect((await fixture.service.list({ limit: 10, beforeId: page.nextCursor })).items.map((row) => row.id)).toEqual([
      2, 1,
    ]);
    expect(
      (
        await fixture.service.list({
          limit: 10,
          outcome: 'failed',
          actorId: 42,
          subjectId: 7,
          action: 'demo.publication',
        })
      ).items,
    ).toHaveLength(1);
    expect((await fixture.service.list({ limit: 10, subjectType: 'demo.commissioning' })).items).toHaveLength(0);
    const old = fixture.source
      .getRepository(AuditLog)
      .create({ ...(await fixture.service.list({ limit: 1 })).items[0], id: undefined, at: new Date(0) });
    await fixture.source.getRepository(AuditLog).insert(old);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(4);
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(3);
    await fixture.service.cleanup();
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(3);
  });

  it('does not roll back a recorded event when a paused cleanup transaction fails', async () => {
    await fixture.source.getRepository(AuditLog).insert({
      at: new Date(0),
      domain: 'demo',
      pluginId: 'abcdefghijklmnopqrstu',
      action: 'demo.publication',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      apiTokenId: null,
      outcome: 'succeeded',
      subjectType: 'demo.device',
      subjectId: 7,
      ipAddress: null,
      userAgent: null,
      details: { revision: 1 },
    });
    await fixture.source.query(`CREATE TRIGGER fail_audit_cleanup BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ROLLBACK, 'cleanup delete failure'); END`);
    const storage = (fixture.service as unknown as { storage: DataSource }).storage;
    const originalTransaction = storage.transaction.bind(storage);
    let releaseCleanup!: () => void;
    const cleanupPaused = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let transactionStarted!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      transactionStarted = resolve;
    });
    const transaction = jest.spyOn(storage, 'transaction').mockImplementation(async (callback) =>
      originalTransaction(async (manager) => {
        transactionStarted();
        await cleanupPaused;
        return callback(manager);
      }),
    );

    try {
      const cleanup = fixture.service.cleanup();
      await cleanupStarted;
      let recorded = false;
      const receipt = fixture.service.record(fixture.event()).then((value) => {
        recorded = true;
        return value;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(recorded).toBe(false);

      releaseCleanup();
      await cleanup;
      await expect(receipt).resolves.toEqual({ status: 'recorded' });
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    } finally {
      transaction.mockRestore();
    }
  });

  it('records an event after a paused cleanup transaction commits', async () => {
    await fixture.source.getRepository(AuditLog).insert({
      at: new Date(0),
      domain: 'demo',
      pluginId: 'abcdefghijklmnopqrstu',
      action: 'demo.publication',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      apiTokenId: null,
      outcome: 'succeeded',
      subjectType: 'demo.device',
      subjectId: 7,
      ipAddress: null,
      userAgent: null,
      details: { revision: 1 },
    });
    const storage = (fixture.service as unknown as { storage: DataSource }).storage;
    const originalTransaction = storage.transaction.bind(storage);
    let releaseCleanup!: () => void;
    const cleanupPaused = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let transactionStarted!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      transactionStarted = resolve;
    });
    const transaction = jest.spyOn(storage, 'transaction').mockImplementation(async (callback) =>
      originalTransaction(async (manager) => {
        transactionStarted();
        await cleanupPaused;
        return callback(manager);
      }),
    );

    try {
      const cleanup = fixture.service.cleanup();
      await cleanupStarted;
      let recorded = false;
      const receipt = fixture.service.record(fixture.event()).then((value) => {
        recorded = true;
        return value;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(recorded).toBe(false);

      releaseCleanup();
      await cleanup;
      await expect(receipt).resolves.toEqual({ status: 'recorded' });
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(1);
    } finally {
      transaction.mockRestore();
    }
  });

  it('fails closed on disabled capture, unsupported domains, invalid input and write failure', async () => {
    for (const disabled of [
      { ...fixture.config, enabled: false },
      { ...fixture.config, plugin_domains_disabled: ['demo'] },
    ]) {
      for (const [key, value] of Object.entries(disabled))
        await fixture.store.setPlainSetting('audit', key, JSON.stringify(value));
      const sink = new AuditService(fixture.source, fixture.store);
      await sink.onModuleInit();
      expect(await sink.record(fixture.event())).toEqual({ status: 'unavailable' });
      await sink.onModuleDestroy();
    }
    await fixture.store.setPlainSetting('audit', 'enabled', 'true');
    await fixture.store.setPlainSetting('audit', 'plugin_domains_disabled', '[]');
    await fixture.store.setPlainSetting('audit', 'domains', '[]');
    await fixture.service.recordResource({
      action: 'resource.created',
      actorId: 42,
      subjectId: 7,
      details: { 'after.name': 'Lathe', 'after.type': 'machine' },
    });
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(0);
    expect(await fixture.service.record({ ...fixture.event(), details: { password: 'not-stored' } })).toEqual({
      status: 'unavailable',
    });
    await fixture.source.query('DROP TABLE audit_log');
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await expect(fixture.service.cleanup()).resolves.toBeUndefined();
  });

  it('rejects oversized details at the database boundary too', async () => {
    await fixture.service.record(fixture.event());
    const row = (await fixture.service.list({ limit: 1 })).items[0];
    await expect(
      fixture.source.getRepository(AuditLog).insert({ ...row, id: undefined, details: { raw: 'x'.repeat(4096) } }),
    ).rejects.toThrow('CHECK constraint');
  });

  it('bounds outstanding writes without an unbounded queue', async () => {
    const receipts = await Promise.all(Array.from({ length: 40 }, () => fixture.service.record(fixture.event())));
    expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(8);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(8);
  });

  it('persists validated settings across store and service restarts, and fails closed on read failure', async () => {
    expect(await readAuditSettings(fixture.store)).toEqual(fixture.config);
    const settings = new SettingsService(null, fixture.store, null);
    await expect(settings.updateAuditSettings({ retention_days: 0 })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ domains: ['unknown'] as never })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ enabled: null })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ secret: 'never' } as never)).rejects.toThrow();
    await settings.updateAuditSettings({ enabled: false, domains: [], retention_days: 2 });
    await fixture.service.onModuleDestroy();
    fixture.store = new SettingsStoreService(fixture.source.getRepository(Setting), null);
    expect(await readAuditSettings(fixture.store)).toEqual({
      enabled: false,
      domains: [],
      plugin_domains_disabled: [],
      retention_days: 2,
    });
    fixture.service = new AuditService(fixture.source, fixture.store);
    await fixture.service.onModuleInit();
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await settings.updateAuditSettings({ enabled: true, domains: ['resource'] });
    jest.spyOn(fixture.store, 'getPlainSetting').mockRejectedValue(new Error('private failure'));
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await expect(fixture.service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
  });

  it('applies retention setting changes to reads immediately and rejects malformed persisted settings', async () => {
    await fixture.service.record(fixture.event());
    const row = (await fixture.service.list({ limit: 1 })).items[0];
    await fixture.source
      .getRepository(AuditLog)
      .insert({ ...row, id: undefined, at: new Date(Date.now() - 3 * 86400000) });
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(2);
    const settings = new SettingsService(null, fixture.store, null);
    await settings.updateAuditSettings({ retention_days: 2 });
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(1);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    for (const invalid of ['null', '"private"', '0']) {
      await fixture.store.setPlainSetting('audit', 'retention_days', invalid);
      expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
      await expect(fixture.service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
      await fixture.service.cleanup();
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    }
  });

  it('bounds admission before settings awaits and recovers after settings failure', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = jest.spyOn(fixture.store, 'getPlainSetting').mockImplementation(async () => {
      await gate;
      throw new Error('private');
    });
    const pending = Array.from({ length: 8 }, () => fixture.service.record(fixture.event()));
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    expect(read).toHaveBeenCalledTimes(32);
    release();
    expect((await Promise.all(pending)).every((receipt) => receipt.status === 'unavailable')).toBe(true);
    read.mockRestore();
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
  });

  it('drains multiple bounded retention batches and filters event prefixes and time windows', async () => {
    await fixture.service.record(fixture.event());
    const row = (await fixture.service.list({ limit: 1 })).items[0];
    for (let batch = 0; batch < 3; batch++) {
      await fixture.source
        .getRepository(AuditLog)
        .insert(Array.from({ length: 800 }, () => ({ ...row, id: undefined, at: new Date(0) })));
    }
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(2401);
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(1);
    await fixture.service.cleanup();
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(1);
    expect(
      (
        await fixture.service.list({
          limit: 10,
          eventPrefix: 'demo.pub',
          from: row.at.toISOString(),
          to: row.at.toISOString(),
        })
      ).items,
    ).toHaveLength(1);
    expect((await fixture.service.list({ limit: 10, eventPrefix: 'demo.commissioning.' })).items).toHaveLength(0);
    expect((await fixture.service.list({ limit: 10, to: new Date(0).toISOString() })).items).toHaveLength(0);
  });

  it('declines writes under SQLite contention within a deadline and recovers', async () => {
    await fixture.source.query('PRAGMA busy_timeout = 10');
    const lock = await new DataSource({ type: 'sqlite', database: fixture.source.options.database }).initialize();
    try {
      await lock.query('BEGIN IMMEDIATE');
      const start = Date.now();
      const receipts = await Promise.all(Array.from({ length: 8 }, () => fixture.service.record(fixture.event())));
      expect(receipts.every((receipt) => receipt.status === 'unavailable')).toBe(true);
      expect(Date.now() - start).toBeLessThan(2500);
      await lock.query('ROLLBACK');
      expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
    } finally {
      await lock.destroy();
    }
  }, 10_000);

  it('uses one safe event snapshot before settings awaits and waits safely for shutdown', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalRead = fixture.store.getPlainSetting.bind(fixture.store);
    const read = jest.spyOn(fixture.store, 'getPlainSetting').mockImplementation(async (parent, key) => {
      await gate;
      return originalRead(parent, key);
    });
    const input = fixture.event();
    const pending = fixture.service.record(input);
    input.principal.userId = 99;
    input.details.revision = 999;
    release();
    expect(await pending).toEqual({ status: 'recorded' });
    read.mockRestore();
    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({
      actorId: 42,
      details: { revision: 2 },
    });
    const writes = Array.from({ length: 8 }, () => fixture.service.record(fixture.event()));
    const shutdown = fixture.service.onModuleDestroy();
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await Promise.all([...writes, shutdown]);
    await expect(fixture.service.list({ limit: 1 })).rejects.toThrow('Audit storage unavailable');
  });
});
it('upgrades the full registered schema, reverts the audit migration, and reapplies it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audit-upgrade-'));
  const prior = Object.values(migrations).filter(
    (migration) =>
      migration !== DurableAudit1783700000000 &&
      migration !== IdentityAudit1783800000000 &&
      migration !== RetirePasswordPolicyAudit1783900000000 &&
      migration !== migrations.AttractapAuditDomain1784000000000 &&
      migration !== migrations.FullAuditDomains1784100000000,
  );
  const database = join(directory, 'upgrade.sqlite');
  let source = new DataSource({ type: 'sqlite', database, entities: Object.values(entities), migrations: prior });
  try {
    await source.initialize();
    await source.runMigrations();
    await source.query(`INSERT INTO "password_policy_audit" ("event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "before", "after", "changedFields")
      VALUES ('global_policy_updated', 1, 'migration-user', '127.0.0.1', 'migration-test', 'migration-request', '{"minLength":12}', '{"minLength":16}', '["minLength"]')`);
    const oversizedRequestId = 'r'.repeat(5_000);
    const oversizedBefore = JSON.stringify({ minLength: 12, requireUppercase: true });
    const oversizedAfter = JSON.stringify({ minLength: 16, requireUppercase: false });
    await source.query(
      `INSERT INTO "password_policy_audit" ("event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "before", "after", "changedFields")
      VALUES ('global_policy_updated', 1, 'migration-user', '127.0.0.1', 'migration-test', ?, ?, ?, '["minLength"]')`,
      [oversizedRequestId, oversizedBefore, oversizedAfter],
    );
    await source.query(
      `INSERT INTO "setting" ("parent", "key", "value") VALUES ('audit', 'domains', '["billing","resource","demo-plugin"]')`,
    );
    await source.destroy();
    source = new DataSource({
      type: 'sqlite',
      database,
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    });
    await source.initialize();
    const applied = await source.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([
      'DurableAudit1783700000000',
      'IdentityAudit1783800000000',
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
      'FullAuditDomains1784100000000',
    ]);
    expect(source.hasMetadata(AuditLog)).toBeTruthy();
    expect(await source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    expect(await source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'audit' AND "key" = 'domains'`)).toEqual([
      { value: '["billing","resource","identity","attractap","administration","project","sso"]' },
    ]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      2,
    );
    expect(
      await source.query(`SELECT "metadata" FROM "password_policy_audit_overflow" WHERE "legacyAuditId" = 2`),
    ).toEqual([
      {
        metadata: JSON.stringify({
          actorUsername: 'migration-user',
          requestId: oversizedRequestId,
          role: null,
          before: oversizedBefore,
          after: oversizedAfter,
          changedFields: '["minLength"]',
        }),
      },
    ]);
    const migratedStore = new SettingsStoreService(source.getRepository(Setting), null);
    const migratedAudit = new AuditService(source, migratedStore);
    await migratedAudit.onModuleInit();
    const migratedList = await new AuditController(migratedAudit).list({ limit: 10 });
    const migratedOversizedEvent = migratedList.items.find((item) => item.details.legacyAuditId === 2);
    expect(migratedOversizedEvent).toMatchObject({
      details: {
        detailsTruncated: 1,
        actorUsername: 'migration-user',
        requestId: oversizedRequestId,
        before: oversizedBefore,
        after: oversizedAfter,
        changedFields: '["minLength"]',
      },
    });
    expect(migratedOversizedEvent?.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await expect(
      new ValidationPipe({ transform: true }).transform(
        { operationId: migratedOversizedEvent?.operationId },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({ operationId: migratedOversizedEvent?.operationId });
    const now = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-16T12:00:00.000Z').getTime());
    await source.query(`INSERT INTO "password_policy_audit_overflow" ("legacyAuditId", "metadata")
      VALUES (999, '{"actorUsername":"expired-user"}')`);
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES ('2026-06-15 11:00:00.000', 'identity', 'identity.password_policy_updated', 'password-policy-audit-999', 'succeeded', 'identity.password_policy', 1,
         '{"migrationSource":"password_policy_audit","legacyAuditId":999,"detailsTruncated":true}')`);
    await source.query(`INSERT INTO "password_policy_audit_overflow" ("legacyAuditId", "metadata")
      VALUES (998, '{"actorUsername":"retained-user"}')`);
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES ('2026-06-15 13:00:00.000', 'identity', 'identity.password_policy_updated', 'e3aedfb1-15c7-4290-9a0c-777f27a8357f', 'succeeded', 'identity.password_policy', 1,
        '{"migrationSource":"password_policy_audit","legacyAuditId":998,"detailsTruncated":true}')`);
    await migratedStore.setPlainSetting('audit', 'retention_days', '1');
    await source.query(`CREATE TRIGGER abort_audit_cleanup BEFORE DELETE ON "audit_log"
      WHEN OLD.id IN (SELECT id FROM "audit_log" WHERE "at" < '2026-06-15 12:00:00.000')
      BEGIN SELECT RAISE(ABORT, 'audit cleanup failed'); END`);
    await migratedAudit.cleanup();
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 999')).toHaveLength(
      1,
    );
    await source.query('DROP TRIGGER abort_audit_cleanup');
    await migratedAudit.cleanup();
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 999')).toEqual([]);
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 998')).toHaveLength(
      1,
    );
    now.mockRestore();
    await migratedAudit.onModuleDestroy();
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES (datetime('now'), 'identity', 'identity.password_policy_updated', 'f4ae9dd5-3b66-4d5e-a46c-03cfaa25e266', 'succeeded', 'identity.password_policy', 1, '{"field":"minLength"}')`);
    await source.query(`UPDATE "setting" SET "value" = '["identity"]'
      WHERE "parent" = 'audit' AND "key" = 'domains'`);
    await source.undoLastMigration();
    await source.undoLastMigration();
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    expect(await source.query('SELECT * FROM password_policy_audit')).toHaveLength(4);
    expect(
      await source.query(
        `SELECT "actorUsername", "requestId", "before", "after", "changedFields" FROM password_policy_audit WHERE "requestId" = 'migration-request'`,
      ),
    ).toEqual([
      {
        actorUsername: 'migration-user',
        requestId: 'migration-request',
        before: '{"minLength":12}',
        after: '{"minLength":16}',
        changedFields: '["minLength"]',
      },
    ]);
    expect(
      await source.query(`SELECT "requestId", "before", "after" FROM password_policy_audit WHERE "requestId" = ?`, [
        oversizedRequestId,
      ]),
    ).toEqual([{ requestId: oversizedRequestId, before: oversizedBefore, after: oversizedAfter }]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      0,
    );
    expect(await source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'audit' AND "key" = 'domains'`)).toEqual([
      { value: '[]' },
    ]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
      'FullAuditDomains1784100000000',
    ]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      4,
    );
    await source.undoLastMigration();
    await source.undoLastMigration();
    await source.undoLastMigration();
    expect(
      await source.query(`SELECT "requestId", "before", "after" FROM password_policy_audit WHERE "requestId" = ?`, [
        oversizedRequestId,
      ]),
    ).toEqual([{ requestId: oversizedRequestId, before: oversizedBefore, after: oversizedAfter }]);
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      'DurableAudit1783700000000',
      'IdentityAudit1783800000000',
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
      'FullAuditDomains1784100000000',
    ]);
  } finally {
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
