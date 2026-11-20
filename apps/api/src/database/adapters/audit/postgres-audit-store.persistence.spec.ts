import type { AuditEntryDraft } from '@attraccess/application-models';
import { AuditLog } from '@attraccess/database-entities';
import { DataSource, EntityManager } from 'typeorm';
import { AuditTransaction, DurableAppendControl } from '../../../audit/audit-persistence.port';
import { TransactionScopeError, type TransactionScope } from '../../unit-of-work';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { AUDIT_BUSY_RETRIES, PostgresAuditStore } from './postgres-audit-store';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

jest.setTimeout(60_000);

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
function transactionOf(from: PostgresAuditStore, ref: TransactionScope | EntityManager) {
  const transaction = from.activeTransaction(
    ref instanceof EntityManager ? legacyEngineTransactionScope(ref) : (ref as TransactionScope),
  );
  if (!transaction) throw new Error('No active transaction');
  return transaction;
}

const open: DurableAppendControl = { refusal: () => undefined, isStopping: () => false };

describe('PostgresAuditStore on independent connections', () => {
  let database: PostgresDatabaseFixture;
  let main: DataSource;
  let observer: DataSource;
  let store: PostgresAuditStore;

  beforeAll(async () => {
    database = await PostgresDatabaseFixture.create();
  });
  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    // Only the audit table is mapped on the main connection, like a store wired beside a reduced model.
    main = await database.open({ entities: [AuditLog] });
    // A third connection: what a reader (or a restarted process) sees committed.
    observer = await database.open({ entities: [AuditLog] });
    await main.query('TRUNCATE "audit_log" RESTART IDENTITY');
    await main.query('DELETE FROM password_policy_audit_overflow');
    await main.query('CREATE TABLE IF NOT EXISTS business_change (id integer PRIMARY KEY)');
    await main.query('TRUNCATE business_change');
    store = new PostgresAuditStore(main);
    expect(await store.open()).toEqual({ status: 'ready' });
  });

  afterEach(async () => {
    await store.close();
  });

  const stored = () => observer.getRepository(AuditLog).find({ order: { id: 'ASC' } });

  it('is not open before open() and writes on a pool of its own with synchronous commit', async () => {
    const other = new PostgresAuditStore(main);
    expect(other.isOpen).toBe(false);
    expect(await other.open()).toEqual({ status: 'ready' });
    expect(other.isOpen).toBe(true);
    await other.close();
    const connection = (store as unknown as { storage: DataSource }).storage;
    expect(await connection.query('SHOW synchronous_commit')).toEqual([{ synchronous_commit: 'on' }]);
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

  it('does not wait for rows another connection holds locked', async () => {
    await observer.query('INSERT INTO business_change VALUES (9)');
    const locker = observer.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();
    await locker.query('UPDATE business_change SET id = 9 WHERE id = 9');
    try {
      expect(await store.appendDurably(draft(3), open)).toEqual({ status: 'stored' });
    } finally {
      await locker.rollbackTransaction();
      await locker.release();
    }
    expect((await stored()).map((row) => row.subjectId)).toEqual([3]);
  });

  it('retries a busy durable write only while the process is not stopping', async () => {
    const connection = (store as unknown as { storage: DataSource }).storage;
    const busy = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    const insert = jest.fn().mockRejectedValue(busy);
    jest.spyOn(connection, 'getRepository').mockReturnValue({ insert } as never);
    const result = await store.appendDurably(draft(4), open);
    expect(insert).toHaveBeenCalledTimes(AUDIT_BUSY_RETRIES + 1);
    expect(result).toMatchObject({ status: 'failed', code: '40P01' });
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
      const unitOfWork = unitOfWorkFor(main);
      const scoped = new PostgresAuditStore(main, unitOfWork);
      await unitOfWork.run(async (scope) => {
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
      const unitOfWork = unitOfWorkFor(main);
      const scoped = new PostgresAuditStore(main, unitOfWork);
      let closed: TransactionScope | undefined;
      await unitOfWork.run(async (scope) => {
        closed = scope;
      });
      expect(scoped.activeTransaction(closed as TransactionScope)).toBeUndefined();
    });

    it('rejects a unit of work scope when no unit of work is wired', async () => {
      const unitOfWork = unitOfWorkFor(main);
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

    it('does not queue the audit writes of one transaction behind those of a transaction on another connection', async () => {
      let releaseFirst!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      await main.transaction(async (first) => {
        const query = first.query.bind(first);
        // The first transaction's SAVEPOINT stalls until the second transaction has written its own audit row.
        jest.spyOn(first, 'query').mockImplementationOnce(async (sql: string, parameters?: unknown[]) => {
          await gate;
          return query(sql, parameters);
        });
        const firstAppend = store.appendInTransaction(transactionOf(store, first), draft(30));
        await main.transaction(async (second) => {
          expect(await store.appendInTransaction(transactionOf(store, second), draft(31))).toEqual({
            status: 'stored',
          });
        });
        releaseFirst();
        expect(await firstAppend).toEqual({ status: 'stored' });
      });
      expect((await stored()).map((row) => row.subjectId)).toEqual([31, 30]);
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
