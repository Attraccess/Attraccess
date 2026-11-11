import { billingTransactionAuditEvent } from './policies/billing';
import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import { Logger, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import * as migrations from '../database/migrations';
import { DurableAudit1783700000000 } from '../database/migrations/1783700000000-durable-audit';
import { IdentityAudit1783800000000 } from '../database/migrations/1783800000000-identity-audit';
import { RetirePasswordPolicyAudit1783900000000 } from '../database/migrations/1783900000000-retire-password-policy-audit';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { readAuditSettings } from './audit.config';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { PluginAuditHost } from './plugin-audit-host';
import { AuditService } from './audit.service';
import { AUDIT_BUSY_RETRIES, MAX_PENDING_AUDIT_WRITES, SQLITE_BUSY_TIMEOUT_MS } from './persistence/audit-storage';
import { AUDIT_DROP_REASONS } from '../metrics/definitions/audit.metrics';
import { createTestAuditMetrics, droppedRecords, setupAuditDatabase } from './audit.test-fixture';
describe('durable audit SQLite', () => {
  const fixture = setupAuditDatabase();
  it('upgrades additively, survives connection restart and principal deletion, prevents updates, and reverts', async () => {
    expect(await fixture.source.query('SELECT * FROM role_permission')).toEqual([
      { roleId: 1, permissionKey: 'system.audit.read' },
    ]);
    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });
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
    fixture.service = new AuditService(fixture.source, fixture.store, fixture.metrics);
    await fixture.service.onModuleInit();
    expect((await fixture.query.list(new AuditQueryDto())).items).toEqual([
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

  it('records while an unrelated transaction is open on the main connection', async () => {
    const runner = fixture.source.createQueryRunner();
    await runner.startTransaction();
    try {
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await fixture.query.list(new AuditQueryDto())).items).toHaveLength(1);
    expect(await droppedRecords(fixture.metrics)).toEqual({});
  });

  it('filters and paginates without duplication; hides expired rows and cleans them', async () => {
    await fixture.plugins.record(fixture.event());
    await fixture.plugins.record({ ...fixture.event(), outcome: 'failed' });
    await fixture.plugins.record(fixture.event());
    const page = await fixture.query.list({ limit: 1 });
    expect(page.nextCursor).toBe(3);
    expect((await fixture.query.list({ limit: 10, beforeId: page.nextCursor })).items.map((row) => row.id)).toEqual([
      2, 1,
    ]);
    expect(
      (
        await fixture.query.list({
          limit: 10,
          outcome: 'failed',
          actorId: 42,
          subjectId: 7,
          action: 'demo.publication',
        })
      ).items,
    ).toHaveLength(1);
    expect((await fixture.query.list({ limit: 10, subjectType: 'demo.commissioning' })).items).toHaveLength(0);
    const old = fixture.source
      .getRepository(AuditLog)
      .create({ ...(await fixture.query.list({ limit: 1 })).items[0], id: undefined, at: new Date(0) });
    await fixture.source.getRepository(AuditLog).insert(old);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(4);
    expect((await fixture.query.list({ limit: 10 })).items).toHaveLength(3);
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
      const receipt = fixture.plugins.record(fixture.event()).then((value) => {
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
      const receipt = fixture.plugins.record(fixture.event()).then((value) => {
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
      const sink = new AuditService(fixture.source, fixture.store, fixture.metrics);
      await sink.onModuleInit();
      expect(await new PluginAuditHost(sink).record(fixture.event())).toEqual({ status: 'unavailable' });
      await sink.onModuleDestroy();
    }
    await fixture.store.setPlainSetting('audit', 'enabled', 'true');
    await fixture.store.setPlainSetting('audit', 'plugin_domains_disabled', '[]');
    await fixture.store.setPlainSetting('audit', 'domains', '[]');
    await fixture.service.record({
      domain: 'resource',
      action: 'resource.created',
      actor: { id: 42, authenticationMethod: 'session' },
      subject: { type: 'resource', id: 7 },
      details: { 'after.name': 'Lathe', 'after.type': 'machine' },
    });
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(0);
    expect(await droppedRecords(fixture.metrics)).toEqual({});
    expect(await fixture.plugins.record({ ...fixture.event(), details: { password: 'not-stored' } })).toEqual({
      status: 'unavailable',
    });
    expect(await droppedRecords(fixture.metrics)).toEqual({ 'unknown:invalid_event': 1 });
    await fixture.source.query('DROP TABLE audit_log');
    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
    expect(await droppedRecords(fixture.metrics)).toEqual({ 'unknown:invalid_event': 1, 'demo:storage_error': 1 });
    await expect(fixture.service.cleanup()).resolves.toBeUndefined();
  });

  it('rejects oversized details at the database boundary too', async () => {
    await fixture.plugins.record(fixture.event());
    const row = (await fixture.query.list({ limit: 1 })).items[0];
    await expect(
      fixture.source.getRepository(AuditLog).insert({ ...row, id: undefined, details: { raw: 'x'.repeat(4096) } }),
    ).rejects.toThrow('CHECK constraint');
  });

  it('records every one of many concurrent writes', async () => {
    const receipts = await Promise.all(Array.from({ length: 40 }, () => fixture.plugins.record(fixture.event())));
    expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(40);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(40);
    expect(await droppedRecords(fixture.metrics)).toEqual({});
  });

  describe('when the database stays locked past the busy timeout', () => {
    afterEach(() => jest.restoreAllMocks());

    /** Makes the next `failures` audit inserts fail like SQLite does after waiting out the busy timeout. */
    const lockAuditInserts = (failures: number) => {
      const insert = Repository.prototype.insert;
      let remaining = failures;
      let attempts = 0;
      jest.spyOn(Repository.prototype, 'insert').mockImplementation(function (this: Repository<object>, ...args) {
        if (this.target !== AuditLog) return insert.apply(this, args);
        attempts++;
        if (remaining-- > 0)
          return Promise.reject(Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }));
        return insert.apply(this, args);
      });
      return () => attempts;
    };

    it('repeats the insert instead of dropping the record', async () => {
      const attempts = lockAuditInserts(AUDIT_BUSY_RETRIES);
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });
      expect(attempts()).toBe(AUDIT_BUSY_RETRIES + 1);
      expect(await droppedRecords(fixture.metrics)).toEqual({});
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(1);
    });

    it('drops the record as storage_error once the retries are used up', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const attempts = lockAuditInserts(AUDIT_BUSY_RETRIES + 1);
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
      expect(attempts()).toBe(AUDIT_BUSY_RETRIES + 1);
      expect(await droppedRecords(fixture.metrics)).toEqual({ 'demo:storage_error': 1 });
      expect(String(error.mock.calls[0][0])).toContain('code=SQLITE_BUSY');
    });

    it('does not repeat an insert that failed for another reason', async () => {
      const attempts = lockAuditInserts(0);
      await fixture.source.query('DROP TABLE audit_log');
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
      expect(attempts()).toBe(1);
    });

    it('does not repeat once shutdown has started', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const attempts = lockAuditInserts(1);
      const write = fixture.plugins.record(fixture.event());
      const shutdown = fixture.service.onModuleDestroy();
      expect(await write).toEqual({ status: 'unavailable' });
      await shutdown;
      expect(attempts()).toBe(1);
      expect(error).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects writes above the pending cap as queue_full and records the rest', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      const receipts = await Promise.all(
        Array.from({ length: MAX_PENDING_AUDIT_WRITES + 25 }, () => fixture.plugins.record(fixture.event())),
      );
      expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(MAX_PENDING_AUDIT_WRITES);
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(MAX_PENDING_AUDIT_WRITES);
      expect(await droppedRecords(fixture.metrics)).toEqual({ 'demo:queue_full': 25 });
      expect(warn).toHaveBeenCalledTimes(25);
      expect(String(warn.mock.calls[0][0])).toContain('reason=queue_full');
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });
    } finally {
      warn.mockRestore();
    }
  }, 60_000);

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
    fixture.service = new AuditService(fixture.source, fixture.store, fixture.metrics);
    await fixture.service.onModuleInit();
    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
    await settings.updateAuditSettings({ enabled: true, domains: ['resource'] });
    jest.spyOn(fixture.store, 'getPlainSetting').mockRejectedValue(new Error('private failure'));
    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
    await expect(fixture.query.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
  });

  it('applies retention setting changes to reads immediately and rejects malformed persisted settings', async () => {
    await fixture.plugins.record(fixture.event());
    const row = (await fixture.query.list({ limit: 1 })).items[0];
    await fixture.source
      .getRepository(AuditLog)
      .insert({ ...row, id: undefined, at: new Date(Date.now() - 3 * 86400000) });
    expect((await fixture.query.list({ limit: 10 })).items).toHaveLength(2);
    const settings = new SettingsService(null, fixture.store, null);
    await settings.updateAuditSettings({ retention_days: 2 });
    expect((await fixture.query.list({ limit: 10 })).items).toHaveLength(1);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    for (const invalid of ['null', '"private"', '0']) {
      await fixture.store.setPlainSetting('audit', 'retention_days', invalid);
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
      await expect(fixture.query.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
      await fixture.service.cleanup();
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    }
  });

  it('counts writes as settings_unavailable while settings cannot be read and recovers afterwards', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const read = jest.spyOn(fixture.store, 'getPlainSetting').mockImplementation(async () => {
      await gate;
      throw new Error('private');
    });
    const pending = Array.from({ length: 8 }, () => fixture.plugins.record(fixture.event()));
    release();
    expect((await Promise.all(pending)).every((receipt) => receipt.status === 'unavailable')).toBe(true);
    expect(await droppedRecords(fixture.metrics)).toEqual({ 'demo:settings_unavailable': 8 });
    expect(warn).toHaveBeenCalledTimes(8);
    expect(String(warn.mock.calls[0][0])).not.toContain('private');
    read.mockRestore();
    warn.mockRestore();
    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });
  });

  it('drains multiple bounded retention batches and filters event prefixes and time windows', async () => {
    await fixture.plugins.record(fixture.event());
    const row = (await fixture.query.list({ limit: 1 })).items[0];
    for (let batch = 0; batch < 3; batch++) {
      await fixture.source
        .getRepository(AuditLog)
        .insert(Array.from({ length: 800 }, () => ({ ...row, id: undefined, at: new Date(0) })));
    }
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(2401);
    expect((await fixture.query.list({ limit: 10 })).items).toHaveLength(1);
    await fixture.service.cleanup();
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(1);
    expect(
      (
        await fixture.query.list({
          limit: 10,
          eventPrefix: 'demo.pub',
          from: row.at.toISOString(),
          to: row.at.toISOString(),
        })
      ).items,
    ).toHaveLength(1);
    expect((await fixture.query.list({ limit: 10, eventPrefix: 'demo.commissioning.' })).items).toHaveLength(0);
    expect((await fixture.query.list({ limit: 10, to: new Date(0).toISOString() })).items).toHaveLength(0);
  });

  it('waits for a held SQLite write lock instead of dropping the write', async () => {
    expect(SQLITE_BUSY_TIMEOUT_MS).toBe(5000);
    const lock = await new DataSource({ type: 'sqlite', database: fixture.source.options.database }).initialize();
    try {
      await lock.query('BEGIN IMMEDIATE');
      const receipts = Promise.all(Array.from({ length: 8 }, () => fixture.plugins.record(fixture.event())));
      await new Promise((resolve) => setTimeout(resolve, 400));
      await lock.query('ROLLBACK');
      expect((await receipts).every((receipt) => receipt.status === 'recorded')).toBe(true);
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(8);
      expect(await droppedRecords(fixture.metrics)).toEqual({});
    } finally {
      await lock.destroy();
    }
  }, 15_000);

  it('logs and counts storage_unavailable when the audit connection cannot exist', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const memory = new DataSource({ type: 'sqlite', database: ':memory:' });
    const metrics = createTestAuditMetrics();
    const sink = new AuditService(memory, fixture.store, metrics);
    await sink.onModuleInit();
    try {
      expect(await new PluginAuditHost(sink).record(fixture.event())).toEqual({ status: 'unavailable' });
      expect(await droppedRecords(metrics)).toEqual({ 'demo:storage_unavailable': 1 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reason=storage_unavailable'));
    } finally {
      await sink.onModuleDestroy();
      warn.mockRestore();
    }
  });

  it('counts invalid events of every domain as invalid_event without storing them', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      expect(await fixture.plugins.record({ ...fixture.event(), action: 'nope' })).toEqual({ status: 'unavailable' });
      for (const domain of ['resource', 'project', 'attractap', 'sso', 'identity', 'administration'])
        expect(await fixture.service.record({ domain, action: 'nope' } as never)).toEqual({ status: 'unavailable' });
      expect(await fixture.service.record(billingTransactionAuditEvent({ transactionId: -1 } as never))).toEqual({
        status: 'unavailable',
      });
      // A core envelope names its domain; only an unprojectable plugin event is `unknown`.
      expect(await droppedRecords(fixture.metrics)).toEqual({
        'unknown:invalid_event': 1,
        'resource:invalid_event': 1,
        'project:invalid_event': 1,
        'attractap:invalid_event': 1,
        'sso:invalid_event': 1,
        'identity:invalid_event': 1,
        'administration:invalid_event': 1,
        'billing:invalid_event': 1,
      });
      expect(warn).toHaveBeenCalledTimes(8);
      for (const [line] of warn.mock.calls) expect(String(line)).toMatch(/reason=invalid_event$/);
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

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
    const pending = fixture.plugins.record(input);
    input.principal.userId = 99;
    input.details.revision = 999;
    release();
    expect(await pending).toEqual({ status: 'recorded' });
    read.mockRestore();
    expect((await fixture.query.list({ limit: 1 })).items[0]).toMatchObject({
      actorId: 42,
      details: { revision: 2 },
    });
    const writes = Array.from({ length: 8 }, () => fixture.plugins.record(fixture.event()));
    const shutdown = fixture.service.onModuleDestroy();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'unavailable' });
      // Writes queued before shutdown are stored; only the one arriving afterwards is dropped.
      expect(await Promise.all(writes)).toEqual(Array(8).fill({ status: 'recorded' }));
      await shutdown;
      expect(await droppedRecords(fixture.metrics)).toEqual({ 'demo:shutting_down': 1 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reason=shutting_down'));
    } finally {
      warn.mockRestore();
    }
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(9);
    await expect(fixture.query.list({ limit: 1 })).rejects.toThrow('Audit storage unavailable');
  });

  it('drops writes still queued when the shutdown drain runs out of time', async () => {
    const lock = await new DataSource({ type: 'sqlite', database: fixture.source.options.database }).initialize();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      await lock.query('BEGIN IMMEDIATE');
      const writes = Array.from({ length: 3 }, () => fixture.plugins.record(fixture.event()));
      (fixture.service as unknown as { shutdownDrainMs: number }).shutdownDrainMs = 50;
      const shutdown = fixture.service.onModuleDestroy();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await lock.query('ROLLBACK');
      // The write that was already waiting for the lock finishes; the two behind it are dropped.
      expect((await Promise.all(writes)).map((receipt) => receipt.status)).toEqual([
        'recorded',
        'unavailable',
        'unavailable',
      ]);
      await shutdown;
      expect(await droppedRecords(fixture.metrics)).toEqual({ 'demo:shutting_down': 2 });
    } finally {
      warn.mockRestore();
      await lock.destroy();
    }
  }, 15_000);

  it('creates zero series for registered plugin domains at startup', async () => {
    const metrics = createTestAuditMetrics();
    const sink = new AuditService(new DataSource({ type: 'sqlite', database: ':memory:' }), fixture.store, metrics);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      await sink.onModuleInit();
      const { values } = await metrics.recordsDropped.get();
      const demo = values.filter((value) => value.labels.domain === 'demo');
      expect(demo.map((value) => value.labels.reason).sort()).toEqual([...AUDIT_DROP_REASONS].sort());
      expect(demo.every((value) => value.value === 0)).toBe(true);
    } finally {
      warn.mockRestore();
      await sink.onModuleDestroy();
    }
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
    const migratedAudit = new AuditService(source, migratedStore, createTestAuditMetrics());
    await migratedAudit.onModuleInit();
    const migratedList = await new AuditController(new AuditQueryService(migratedAudit, source, migratedStore)).list({
      limit: 10,
    });
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
