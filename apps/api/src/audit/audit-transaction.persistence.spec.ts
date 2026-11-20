import { auditConnectionOf } from '../database/adapters/audit/postgres-audit-service.test-fixture';
import { billingTransactionAuditEvent } from './policies/billing';
import { Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { droppedRecords, setupAuditDatabase } from '../database/adapters/audit/audit.test-fixture';
import { legacyEngineTransactionScope } from '../database/adapters/common/legacy-engine-transaction';

describe('durable audit (PostgreSQL)', () => {
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
      (await fixture.query.list({ limit: 10 })).items.map((item) => item.subjectId).sort();

    beforeEach(async () => {
      await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
      await fixture.source.query('CREATE TABLE business_change (id integer PRIMARY KEY)');
    });

    // Every transaction runs on a pooled connection of its own; the caller's transaction is this one.
    const run = <T>(work: (manager: EntityManager) => Promise<T>) => fixture.source.transaction(work);

    describe('on the main connection', () => {
      it('commits the audit row with the change', async () => {
        await run(async (manager) => {
          await manager.query('INSERT INTO business_change VALUES (1)');
          expect(
            await fixture.service.record(
              billingTransactionAuditEvent(billing(8)),
              legacyEngineTransactionScope(manager),
            ),
          ).toEqual({
            status: 'recorded',
          });
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
            expect(
              await fixture.service.record(
                billingTransactionAuditEvent(billing(8)),
                legacyEngineTransactionScope(manager),
              ),
            ).toEqual({
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
          await fixture.service.record(billingTransactionAuditEvent(billing(8)), legacyEngineTransactionScope(manager));
          await manager.transaction(async (nested) => {
            await fixture.service.record(
              billingTransactionAuditEvent(billing(9)),
              legacyEngineTransactionScope(nested),
            );
          });
          await expect(
            manager.transaction(async (nested) => {
              await fixture.service.record(
                billingTransactionAuditEvent(billing(10)),
                legacyEngineTransactionScope(nested),
              );
              throw new Error('nested rollback');
            }),
          ).rejects.toThrow('nested rollback');
        });
        expect(await auditedSubjects()).toEqual([8, 9]);
      });

      it('keeps the business change, logs and counts when the audit insert fails', async () => {
        await fixture.source.query(`CREATE FUNCTION fail_audit_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'secret-detail' USING ERRCODE = 'integrity_constraint_violation'; END; $$`);
        await fixture.source.query(
          'CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_audit_insert_fn()',
        );
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        try {
          await run(async (manager) => {
            await manager.query('INSERT INTO business_change VALUES (1)');
            expect(
              await fixture.service.record(
                billingTransactionAuditEvent(billing(8)),
                legacyEngineTransactionScope(manager),
              ),
            ).toEqual({
              status: 'unavailable',
            });
            // The failed savepoint is gone: the transaction keeps working and later audit rows still land.
            await manager.query('INSERT INTO business_change VALUES (2)');
            await manager.query('DROP TRIGGER fail_audit_insert ON audit_log');
            expect(
              await fixture.service.record(
                billingTransactionAuditEvent(billing(9)),
                legacyEngineTransactionScope(manager),
              ),
            ).toEqual({
              status: 'recorded',
            });
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
          expect(line).toContain('code=23000');
          expect(line).not.toContain('secret-detail');
        } finally {
          error.mockRestore();
        }
      });

      it('keeps a concurrent audit row when an overlapping audit insert in the same transaction fails', async () => {
        await fixture.source.query(`CREATE FUNCTION fail_audit_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'x' USING ERRCODE = 'integrity_constraint_violation'; END; $$`);
        await fixture.source.query(
          'CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_log FOR EACH ROW WHEN (NEW."subjectId" = 8) EXECUTE FUNCTION fail_audit_insert_fn()',
        );
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        try {
          const receipts = await run((manager) =>
            Promise.all([
              fixture.service.record(billingTransactionAuditEvent(billing(8)), legacyEngineTransactionScope(manager)),
              fixture.service.record(billingTransactionAuditEvent(billing(9)), legacyEngineTransactionScope(manager)),
            ]),
          );
          expect(receipts).toEqual([{ status: 'unavailable' }, { status: 'recorded' }]);
          expect(await auditedSubjects()).toEqual([9]);
          expect(await droppedRecords(fixture.metrics)).toEqual({ 'billing:storage_error': 1 });
        } finally {
          error.mockRestore();
        }
      });

      it('reads uncached audit settings through the caller transaction, not another connection', async () => {
        const store = fixture.store as unknown as { cache: Map<string, unknown> };
        const mainRead = jest.spyOn(fixture.store['rows']['settings'], 'findOneBy');
        try {
          await run(async (manager) => {
            store.cache.clear();
            expect(
              await fixture.service.record(
                billingTransactionAuditEvent(billing(8)),
                legacyEngineTransactionScope(manager),
              ),
            ).toEqual({
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
      const storage = auditConnectionOf(fixture.service);
      const insert = jest.spyOn(storage, 'getRepository');
      await fixture.source.transaction(async (manager) => {
        expect(
          await fixture.service.record(billingTransactionAuditEvent(billing(8)), legacyEngineTransactionScope(manager)),
        ).toEqual({
          status: 'recorded',
        });
      });
      expect(insert).not.toHaveBeenCalled();
      insert.mockRestore();
    });

    it('does not write when audit or the domain is disabled, and does not count a drop', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      await fixture.store.setPlainSetting('audit', 'domains', '[]');
      await fixture.source.transaction(async (manager) => {
        expect(
          await fixture.service.record(billingTransactionAuditEvent(billing(8)), legacyEngineTransactionScope(manager)),
        ).toEqual({
          status: 'unavailable',
        });
      });
      await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
      await fixture.store.setPlainSetting('audit', 'enabled', 'false');
      expect(await fixture.service.record(billingTransactionAuditEvent(billing(9)))).toEqual({ status: 'unavailable' });
      expect(await auditedSubjects()).toEqual([]);
      expect(await droppedRecords(fixture.metrics)).toEqual({});
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
