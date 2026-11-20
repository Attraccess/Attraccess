import { TypeOrmSettingsRows } from '../database/adapters/settings/typeorm-settings-rows';
import {
  auditConnectionOf,
  createPostgresAuditService,
} from '../database/adapters/audit/postgres-audit-service.test-fixture';
import { billingTransactionAuditEvent } from './policies/billing';
import { AuditLog, Setting } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { readAuditSettings } from './audit.config';
import { PluginAuditHost } from './plugin-audit-host';
import { MAX_PENDING_AUDIT_WRITES } from './persistence/audit-storage';
import { AUDIT_BUSY_RETRIES } from '../database/adapters/audit/postgres-audit-store';
import { AUDIT_DROP_REASONS } from '../metrics/definitions/audit.metrics';
import {
  createTestAuditMetrics,
  droppedRecords,
  setupAuditDatabase,
} from '../database/adapters/audit/audit.test-fixture';
describe('durable audit (PostgreSQL)', () => {
  const fixture = setupAuditDatabase();
  it('stores audit rows immutably without foreign keys, and survives a connection restart and principal deletion', async () => {
    const [grant] = await fixture.source.query(
      `SELECT "roleId" FROM role_permission WHERE "permissionKey" = 'system.audit.read'`,
    );
    expect(grant).toEqual({ roleId: expect.any(Number) });
    expect(await fixture.plugins.record(fixture.event())).toEqual({ status: 'recorded' });
    await expect(fixture.source.query("UPDATE audit_log SET outcome = 'failed'")).rejects.toThrow('immutable');
    expect(
      await fixture.source.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'audit_log'::regclass AND contype = 'f'`,
      ),
    ).toEqual([]);
    await fixture.source.query('DELETE FROM role WHERE id = $1', [grant.roleId]);
    await fixture.service.onModuleDestroy();
    fixture.store = new SettingsStoreService(
      TypeOrmSettingsRows.forRepository(fixture.source.getRepository(Setting)),
      null,
    );
    fixture.service = createPostgresAuditService(fixture.source, fixture.store, fixture.metrics);
    await fixture.service.onModuleInit();
    expect((await fixture.query.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({ actorId: 42, details: { revision: 2 } }),
    ]);
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
    await fixture.source.query(`CREATE FUNCTION fail_audit_cleanup_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'cleanup delete failure'; END; $$`);
    await fixture.source.query(`CREATE TRIGGER fail_audit_cleanup BEFORE DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION fail_audit_cleanup_fn()`);
    const storage = auditConnectionOf(fixture.service);
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
    const storage = auditConnectionOf(fixture.service);
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
      const sink = createPostgresAuditService(fixture.source, fixture.store, fixture.metrics);
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
    ).rejects.toThrow('check constraint');
  });

  it('records every one of many concurrent writes', async () => {
    const receipts = await Promise.all(Array.from({ length: 40 }, () => fixture.plugins.record(fixture.event())));
    expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(40);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(40);
    expect(await droppedRecords(fixture.metrics)).toEqual({});
  });

  describe('when the database reports a serialization failure or deadlock', () => {
    afterEach(() => jest.restoreAllMocks());

    /** Makes the next `failures` audit inserts fail like PostgreSQL does for a lost serialization race. */
    const lockAuditInserts = (failures: number) => {
      const insert = Repository.prototype.insert;
      let remaining = failures;
      let attempts = 0;
      jest.spyOn(Repository.prototype, 'insert').mockImplementation(function (this: Repository<object>, ...args) {
        if (this.target !== AuditLog) return insert.apply(this, args);
        attempts++;
        if (remaining-- > 0)
          return Promise.reject(Object.assign(new Error('could not serialize access'), { code: '40001' }));
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
      expect(String(error.mock.calls[0][0])).toContain('code=40001');
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
    const stored = await readAuditSettings(fixture.store);
    expect({ ...stored, domains: [...stored.domains].sort() }).toEqual(fixture.config);
    const settings = new SettingsService(null, fixture.store, null);
    await expect(settings.updateAuditSettings({ retention_days: 0 })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ domains: ['unknown'] as never })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ enabled: null })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ secret: 'never' } as never)).rejects.toThrow();
    await settings.updateAuditSettings({ enabled: false, domains: [], retention_days: 2 });
    await fixture.service.onModuleDestroy();
    fixture.store = new SettingsStoreService(
      TypeOrmSettingsRows.forRepository(fixture.source.getRepository(Setting)),
      null,
    );
    expect(await readAuditSettings(fixture.store)).toEqual({
      enabled: false,
      domains: [],
      plugin_domains_disabled: [],
      retention_days: 2,
    });
    fixture.service = createPostgresAuditService(fixture.source, fixture.store, fixture.metrics);
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

  it('waits for a held table lock instead of dropping the write', async () => {
    const lock = fixture.source.createQueryRunner();
    try {
      await lock.startTransaction();
      await lock.query('LOCK TABLE audit_log IN ACCESS EXCLUSIVE MODE');
      const receipts = Promise.all(Array.from({ length: 8 }, () => fixture.plugins.record(fixture.event())));
      await new Promise((resolve) => setTimeout(resolve, 400));
      await lock.rollbackTransaction();
      expect((await receipts).every((receipt) => receipt.status === 'recorded')).toBe(true);
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(8);
      expect(await droppedRecords(fixture.metrics)).toEqual({});
    } finally {
      await lock.release();
    }
  }, 15_000);

  it('logs and counts storage_unavailable when the audit connection cannot exist', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const memory = new DataSource({
      type: 'postgres',
      url: 'postgres://nobody:nothing@127.0.0.1:1/none',
    });
    const metrics = createTestAuditMetrics();
    const sink = createPostgresAuditService(memory, fixture.store, metrics);
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
    const lock = fixture.source.createQueryRunner();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      await lock.startTransaction();
      await lock.query('LOCK TABLE audit_log IN ACCESS EXCLUSIVE MODE');
      const writes = Array.from({ length: 3 }, () => fixture.plugins.record(fixture.event()));
      (fixture.service as unknown as { shutdownDrainMs: number }).shutdownDrainMs = 50;
      const shutdown = fixture.service.onModuleDestroy();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await lock.rollbackTransaction();
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
      await lock.release();
    }
  }, 15_000);

  it('creates zero series for registered plugin domains at startup', async () => {
    const metrics = createTestAuditMetrics();
    const sink = createPostgresAuditService(
      new DataSource({ type: 'postgres', url: 'postgres://nobody:nothing@127.0.0.1:1/none' }),
      fixture.store,
      metrics,
    );
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
