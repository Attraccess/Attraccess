import type { AuditEntryDraft } from '@attraccess/application-models';
import { AuditLog } from '@attraccess/database-entities';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { AuditTransaction, DurableAppendControl } from '../../../audit/audit-persistence.port';
import { createDataSource } from '../../sqlite/sqlite-connection';
import { createSqliteUnitOfWork } from '../../sqlite/sqlite-unit-of-work';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TransactionScopeError, type TransactionScope } from '../../unit-of-work';
import { AUDIT_BUSY_RETRIES, SqliteAuditStore } from './sqlite-audit-store';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

const draft = (subjectId: number, details: AuditEntryDraft['details'] = {}): AuditEntryDraft => ({
  domain: 'resource',
  pluginId: null,
  action: 'resource.updated',
  operationId: `op-${subjectId}`,
  actorId: 1,
  authenticationMethod: 'session',
  apiTokenId: null,
  outcome: 'succeeded',
  subjectType: 'resource',
  subjectId,
  ipAddress: null,
  userAgent: null,
  details,
});

/** The audit transaction behind a unit-of-work scope, or behind a transaction the spec opened itself. */
function transactionOf(from: SqliteAuditStore, ref: TransactionScope | EntityManager) {
  const transaction = from.activeTransaction(
    ref instanceof EntityManager ? legacyEngineTransactionScope(ref) : (ref as TransactionScope),
  );
  if (!transaction) throw new Error('No active transaction');
  return transaction;
}

const open: DurableAppendControl = { refusal: () => undefined, isStopping: () => false };

describe('SqliteAuditStore on independent connections', () => {
  // The released schema, built once by the migration track and copied for every test.
  let template: { directory: string; file: string };
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'audit-store-template-'));
    const file = join(directory, 'template.sqlite');
    const migrated = await createTestDataSource({ location: file, migrationsRun: true });
    await closeTestDataSource(migrated);
    template = { directory, file };
  });
  afterAll(async () => {
    await rm(template.directory, { recursive: true, force: true });
  });

  let directory: string;
  let main: DataSource;
  let observer: DataSource;
  let store: SqliteAuditStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'audit-store-'));
    const database = join(directory, 'audit.sqlite');
    await copyFile(template.file, database);
    main = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database,
      entities: [AuditLog],
      synchronize: false,
    }).initialize();
    // Rows the migrations seeded are not part of these cases.
    await main.query('DELETE FROM audit_log');
    await main.query('CREATE TABLE business_change (id integer PRIMARY KEY)');
    // A third connection: what a reader (or a restarted process) sees on stable storage.
    // Guarded like the application's connections: the file's write lock it takes is the one the audit store waits for.
    observer = await createDataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database,
      entities: [AuditLog],
    }).initialize();
    store = new SqliteAuditStore(main);
    expect(await store.open()).toEqual({ status: 'ready' });
  });

  afterEach(async () => {
    await store.close();
    await observer.destroy();
    await main.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const stored = () => observer.getRepository(AuditLog).find({ order: { id: 'ASC' } });

  it('is unsupported for an in-memory database and not open before open()', async () => {
    const memory = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: ':memory:',
    }).initialize();
    const other = new SqliteAuditStore(memory);
    expect(other.isOpen).toBe(false);
    expect(await other.open()).toEqual({ status: 'unsupported' });
    await memory.destroy();
  });

  it('writes the durable connection with synchronous = FULL and the audit busy timeout', async () => {
    const connection = (store as unknown as { storage: DataSource }).storage;
    expect(await connection.query('PRAGMA synchronous')).toEqual([{ synchronous: 2 }]);
    expect(connection).not.toBe(main);
  });

  it('stores a durable append before it resolves: visible on an independent connection at once', async () => {
    expect(await store.appendDurably(draft(1, { a: 'b' }), open)).toEqual({ status: 'stored' });
    expect(await stored()).toMatchObject([{ subjectId: 1, details: { a: 'b' } }]);
  });

  it('keeps request order for concurrent durable appends', async () => {
    const ids = Array.from({ length: 25 }, (_, index) => index + 1);
    await Promise.all(ids.map((id) => store.appendDurably(draft(id), open)));
    expect((await stored()).map((row) => row.subjectId)).toEqual(ids);
  });

  it('survives a rolled back business transaction on another connection: the durable row stays', async () => {
    await expect(
      main.transaction(async (manager) => {
        // The transaction has not written yet, so it holds no write lock: the durable row can commit beside it.
        expect(await store.appendDurably(draft(2), open)).toEqual({ status: 'stored' });
        await manager.query('INSERT INTO business_change VALUES (1)');
        throw new Error('business failure');
      }),
    ).rejects.toThrow('business failure');
    expect(await main.query('SELECT * FROM business_change')).toEqual([]);
    expect((await stored()).map((row) => row.subjectId)).toEqual([2]);
  });

  it('waits out a write lock held by another connection and stores once it is released', async () => {
    const locker = observer.createQueryRunner();
    await locker.connect();
    await locker.query('BEGIN IMMEDIATE');
    let settled = false;
    const append = store.appendDurably(draft(3), open).then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toBe(false);
    await locker.query('COMMIT');
    await locker.release();
    expect(await append).toEqual({ status: 'stored' });
    expect((await stored()).map((row) => row.subjectId)).toEqual([3]);
  });

  it('retries a busy durable write only while the process is not stopping', async () => {
    const connection = (store as unknown as { storage: DataSource }).storage;
    const busy = Object.assign(new Error('busy'), { code: 'SQLITE_BUSY' });
    const insert = jest.fn().mockRejectedValue(busy);
    jest.spyOn(connection, 'getRepository').mockReturnValue({ insert } as never);
    const result = await store.appendDurably(draft(4), open);
    expect(insert).toHaveBeenCalledTimes(AUDIT_BUSY_RETRIES + 1);
    expect(result).toMatchObject({ status: 'failed', code: 'SQLITE_BUSY' });
    insert.mockClear();
    await store.appendDurably(draft(5), { refusal: () => undefined, isStopping: () => true });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('refuses a durable append once the control says so, and when the connection is closed', async () => {
    expect(await store.appendDurably(draft(6), { refusal: () => 'shutting_down', isStopping: () => true })).toEqual({
      status: 'refused',
      reason: 'shutting_down',
    });
    await store.close();
    expect(store.isOpen).toBe(false);
    expect(await store.appendDurably(draft(7), open)).toEqual({ status: 'refused', reason: 'storage_unavailable' });
    expect(await stored()).toEqual([]);
  });

  describe('in the caller transaction', () => {
    it('commits and rolls back with the caller, and does not use the durable connection', async () => {
      await main.transaction(async (manager) => {
        const transaction = store.activeTransaction(legacyEngineTransactionScope(manager));
        expect(transaction).toBeDefined();
        expect(await store.appendInTransaction(transaction as AuditTransaction, draft(10))).toEqual({
          status: 'stored',
        });
        // Not visible to another connection before the caller commits.
        expect(await stored()).toEqual([]);
      });
      expect((await stored()).map((row) => row.subjectId)).toEqual([10]);
      await expect(
        main.transaction(async (manager) => {
          await store.appendInTransaction(transactionOf(store, manager), draft(11));
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect((await stored()).map((row) => row.subjectId)).toEqual([10]);
    });

    it('joins the unit of work scope: audit and business writes commit or roll back together', async () => {
      const unitOfWork = createSqliteUnitOfWork(main);
      const scoped = new SqliteAuditStore(main, unitOfWork);
      await unitOfWork.run(async (scope) => {
        await main.manager.query('SELECT 1');
        const transaction = scoped.activeTransaction(scope);
        expect(transaction).toBeDefined();
        expect(await scoped.appendInTransaction(transaction as AuditTransaction, draft(40))).toEqual({
          status: 'stored',
        });
      });
      await expect(
        unitOfWork.run(async (scope) => {
          await scoped.appendInTransaction(transactionOf(scoped, scope), draft(41));
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect((await stored()).map((row) => row.subjectId)).toEqual([40]);
    });

    it('writes durably for a scope that already closed instead of dropping the event', async () => {
      const unitOfWork = createSqliteUnitOfWork(main);
      const scoped = new SqliteAuditStore(main, unitOfWork);
      let closed: TransactionScope | undefined;
      await unitOfWork.run(async (scope) => {
        closed = scope;
      });
      expect(scoped.activeTransaction(closed as TransactionScope)).toBeUndefined();
    });

    it('rejects a unit of work scope when no unit of work is wired', async () => {
      const unitOfWork = createSqliteUnitOfWork(main);
      await unitOfWork.run(async (scope) => {
        expect(() => store.activeTransaction(scope)).toThrow(TransactionScopeError);
      });
    });

    it('has no transaction to join without an active one', async () => {
      expect(store.activeTransaction(undefined)).toBeUndefined();
      expect(store.activeTransaction(legacyEngineTransactionScope(main.manager))).toBeUndefined();
    });

    it('leaves the caller transaction intact when only the audit insert fails', async () => {
      await main.transaction(async (manager) => {
        await manager.query('INSERT INTO business_change VALUES (1)');
        const bad = { ...draft(12), domain: null as never };
        const result = await store.appendInTransaction(transactionOf(store, manager), bad);
        expect(result).toMatchObject({ status: 'failed' });
        expect(await store.appendInTransaction(transactionOf(store, manager), draft(13))).toEqual({
          status: 'stored',
        });
      });
      expect(await main.query('SELECT * FROM business_change')).toEqual([{ id: 1 }]);
      expect((await stored()).map((row) => row.subjectId)).toEqual([13]);
    });

    it('serializes overlapping in-transaction appends so a failure cannot undo a reported success', async () => {
      await main.transaction(async (manager) => {
        const transaction = transactionOf(store, manager);
        const results = await Promise.all([
          store.appendInTransaction(transaction, draft(20)),
          store.appendInTransaction(transaction, { ...draft(21), domain: null as never }),
          store.appendInTransaction(transaction, draft(22)),
        ]);
        expect(results.map((result) => result.status)).toEqual(['stored', 'failed', 'stored']);
      });
      expect((await stored()).map((row) => row.subjectId)).toEqual([20, 22]);
    });
  });

  describe('retention', () => {
    it('deletes expired rows in batches in the durable write order and never after stopping', async () => {
      const old = new Date(Date.now() - 200 * 86_400_000);
      await observer.getRepository(AuditLog).insert([1, 2, 3].map((id) => ({ ...draft(id), at: old })));
      await store.appendDurably(draft(4), open);
      const cutoff = new Date(Date.now() - 100 * 86_400_000);
      expect(await store.deleteExpired(cutoff, 2, () => true)).toBe(0);
      expect(await store.deleteExpired(cutoff, 2, () => false)).toBe(2);
      expect(await store.deleteExpired(cutoff, 2, () => false)).toBe(1);
      expect(await store.deleteExpired(cutoff, 2, () => false)).toBe(0);
      expect((await stored()).map((row) => row.subjectId)).toEqual([4]);
    });
  });

  describe('reads', () => {
    it('filters, orders newest first and reports whether more entries exist', async () => {
      for (const id of [1, 2, 3]) await store.appendDurably(draft(id, { n: id }), open);
      const page = await store.findEntries({ notBefore: new Date(0) }, 2);
      expect(page.entries.map((entry) => entry.subjectId)).toEqual([3, 2]);
      expect(page.hasMore).toBe(true);
      const filtered = await store.findEntries(
        { notBefore: new Date(0), subjectId: 1, eventPrefix: 'resource.', beforeId: 3 },
        5,
      );
      expect(filtered.entries.map((entry) => entry.subjectId)).toEqual([1]);
      expect(filtered.hasMore).toBe(false);
    });

    it('hydrates legacy password-policy details from the overflow table', async () => {
      // The overflow table comes from the migration track.
      await main.query('INSERT INTO password_policy_audit_overflow VALUES (5, \'{"minLength":12}\')');
      await store.appendDurably(draft(1, { legacyAuditId: 5 }), open);
      const { entries } = await store.findEntries({ notBefore: new Date(0) }, 5);
      expect(entries[0].details).toEqual({ legacyAuditId: 5, minLength: 12 });
    });

    it('returns no names for an empty id list or an entity the connection does not map', async () => {
      expect(await store.findCurrentNames('resource', [])).toEqual(new Map());
      expect(await store.findCurrentNames('user', [1])).toEqual(new Map());
    });
  });
});
