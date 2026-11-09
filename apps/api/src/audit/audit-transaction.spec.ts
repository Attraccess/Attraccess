import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection, runSerializedTransaction } from '../database/run-serialized-transaction';
import { AuditTransactionAbortedError } from './persistence/audit-storage';
import { droppedRecords, setupAuditDatabase } from './audit.test-fixture';

describe('durable audit SQLite', () => {
  const fixture = setupAuditDatabase();

  describe('inside the caller transaction', () => {
    const billing = (transactionId: number) => ({
      transactionId,
      userId: 42,
      amount: 0,
      status: 'pending',
      source: 'resource-usage',
    });
    const auditedSubjects = async () =>
      (await fixture.service.list({ limit: 10 })).items.map((item) => item.subjectId).sort();

    beforeEach(async () => {
      await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
      await fixture.source.query('CREATE TABLE business_change (id integer PRIMARY KEY)');
    });

    afterEach(async () => {
      await closeResourceTransactionConnection(fixture.source);
    });

    // The main connection shares one query runner; the resource-lifecycle connection is a second, independent one.
    const connections = {
      main: (work: Parameters<typeof runSerializedTransaction>[1]) => fixture.source.transaction(work),
      'resource-lifecycle': (work: Parameters<typeof runSerializedTransaction>[1]) =>
        runSerializedTransaction(fixture.source.manager, work),
    };

    describe.each(Object.entries(connections))('on the %s connection', (_name, run) => {
      it('commits the audit row with the change', async () => {
        await run(async (manager) => {
          await manager.query('INSERT INTO business_change VALUES (1)');
          expect(await fixture.service.recordBillingTransaction(billing(8), manager)).toEqual({ status: 'recorded' });
          // Not visible to other connections before the caller commits.
          expect(await auditedSubjects()).toEqual([]);
        });
        expect(await auditedSubjects()).toEqual([8]);
        expect(await fixture.source.query('SELECT * FROM business_change')).toHaveLength(1);
        expect(await droppedRecords(fixture.metrics)).toEqual({});
      });

      it('rolls back with the caller transaction', async () => {
        await expect(
          run(async (manager) => {
            await manager.query('INSERT INTO business_change VALUES (1)');
            expect(await fixture.service.recordBillingTransaction(billing(8), manager)).toEqual({
              status: 'recorded',
            });
            throw new Error('rollback');
          }),
        ).rejects.toThrow('rollback');
        expect(await auditedSubjects()).toEqual([]);
        expect(await fixture.source.query('SELECT * FROM business_change')).toEqual([]);
      });

      it('keeps rows of an outer and a committed savepoint when a sibling savepoint rolls back', async () => {
        await run(async (manager) => {
          await fixture.service.recordBillingTransaction(billing(8), manager);
          await manager.transaction(async (nested) => {
            await fixture.service.recordBillingTransaction(billing(9), nested);
          });
          await expect(
            manager.transaction(async (nested) => {
              await fixture.service.recordBillingTransaction(billing(10), nested);
              throw new Error('nested rollback');
            }),
          ).rejects.toThrow('nested rollback');
        });
        expect(await auditedSubjects()).toEqual([8, 9]);
      });

      it('keeps the business change, logs and counts when the audit insert fails', async () => {
        await fixture.source.query(
          "CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'secret-detail'); END",
        );
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        try {
          await run(async (manager) => {
            await manager.query('INSERT INTO business_change VALUES (1)');
            expect(await fixture.service.recordBillingTransaction(billing(8), manager)).toEqual({
              status: 'unavailable',
            });
            // The failed savepoint is gone: the transaction keeps working and later audit rows still land.
            await manager.query('INSERT INTO business_change VALUES (2)');
            await manager.query('DROP TRIGGER fail_audit_insert');
            expect(await fixture.service.recordBillingTransaction(billing(9), manager)).toEqual({ status: 'recorded' });
          });
          expect(await fixture.source.query('SELECT id FROM business_change ORDER BY id')).toEqual([
            { id: 1 },
            { id: 2 },
          ]);
          expect(await auditedSubjects()).toEqual([9]);
          expect(await droppedRecords(fixture.metrics)).toEqual({ 'billing:storage_error': 1 });
          expect(error).toHaveBeenCalledTimes(1);
          const line = String(error.mock.calls[0][0]);
          expect(line).toContain('domain=billing action=billing.transaction.created reason=storage_error');
          expect(line).toContain('code=SQLITE_CONSTRAINT');
          expect(line).not.toContain('secret-detail');
        } finally {
          error.mockRestore();
        }
      });

      it('keeps a concurrent audit row when an overlapping audit insert in the same transaction fails', async () => {
        await fixture.source.query(
          'CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_log WHEN NEW."subjectId" = 8 BEGIN SELECT RAISE(ABORT, \'x\'); END',
        );
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        try {
          const receipts = await run((manager) =>
            Promise.all([
              fixture.service.recordBillingTransaction(billing(8), manager),
              fixture.service.recordBillingTransaction(billing(9), manager),
            ]),
          );
          expect(receipts).toEqual([{ status: 'unavailable' }, { status: 'recorded' }]);
          expect(await auditedSubjects()).toEqual([9]);
          expect(await droppedRecords(fixture.metrics)).toEqual({ 'billing:storage_error': 1 });
        } finally {
          error.mockRestore();
        }
      });

      it('aborts the caller when SQLite discards the whole transaction, and the connection stays usable', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        try {
          let receipts = 0;
          await expect(
            run(async (manager) => {
              await manager.query('INSERT INTO business_change VALUES (1)');
              // SQLITE_FULL rolls back the whole transaction, so the savepoint cannot be rolled back.
              const [{ page_count }] = await manager.query('PRAGMA page_count');
              await manager.query(`PRAGMA max_page_count = ${page_count}`);
              while (
                (await fixture.service.recordBillingTransaction(billing(++receipts), manager)).status === 'recorded'
              );
              await manager.query('INSERT INTO business_change VALUES (2)');
            }),
          ).rejects.toBeInstanceOf(AuditTransactionAbortedError);
          await fixture.source.query('PRAGMA max_page_count = 1073741823');
          expect(await fixture.source.query('SELECT * FROM business_change')).toEqual([]);
          expect(await auditedSubjects()).toEqual([]);
          expect(await droppedRecords(fixture.metrics)).toEqual({ 'billing:storage_error': 1 });
          expect(String(error.mock.calls[0][0])).toContain('code=SQLITE_FULL');
          // A later transaction on the same connection starts at depth 1 (BEGIN, not a stale savepoint) and commits.
          await run(async (manager) => {
            await manager.query('PRAGMA max_page_count = 1073741823');
            expect((manager.queryRunner as unknown as { transactionDepth: number }).transactionDepth).toBe(1);
            await manager.query('INSERT INTO business_change VALUES (3)');
            expect(await fixture.service.recordBillingTransaction(billing(99), manager)).toEqual({
              status: 'recorded',
            });
          });
          expect(await fixture.source.query('SELECT id FROM business_change')).toEqual([{ id: 3 }]);
          expect(await auditedSubjects()).toEqual([99]);
        } finally {
          error.mockRestore();
        }
      });

      it('reads uncached audit settings through the caller transaction, not another connection', async () => {
        const store = fixture.store as unknown as { cache: Map<string, unknown> };
        const mainRead = jest.spyOn(fixture.store['settingRepository'], 'findOneBy');
        try {
          await run(async (manager) => {
            store.cache.clear();
            expect(await fixture.service.recordBillingTransaction(billing(8), manager)).toEqual({
              status: 'recorded',
            });
          });
          expect(mainRead).not.toHaveBeenCalled();
          // Values read inside a transaction are not cached: that transaction could still roll back.
          expect(store.cache.size).toBe(0);
          expect(await auditedSubjects()).toEqual([8]);
        } finally {
          mainRead.mockRestore();
        }
      });
    });

    it('writes without the audit queue, even while the audit connection is saturated', async () => {
      const storage = (fixture.service as unknown as { storage: DataSource }).storage;
      const insert = jest.spyOn(storage, 'getRepository');
      await fixture.source.transaction(async (manager) => {
        expect(await fixture.service.recordBillingTransaction(billing(8), manager)).toEqual({ status: 'recorded' });
      });
      expect(insert).not.toHaveBeenCalled();
      insert.mockRestore();
    });

    it('does not write when audit or the domain is disabled, and does not count a drop', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      await fixture.store.setPlainSetting('audit', 'domains', '[]');
      await fixture.source.transaction(async (manager) => {
        expect(await fixture.service.recordBillingTransaction(billing(8), manager)).toEqual({ status: 'unavailable' });
      });
      await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
      await fixture.store.setPlainSetting('audit', 'enabled', 'false');
      expect(await fixture.service.recordBillingTransaction(billing(9))).toEqual({ status: 'unavailable' });
      expect(await auditedSubjects()).toEqual([]);
      expect(await droppedRecords(fixture.metrics)).toEqual({});
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
