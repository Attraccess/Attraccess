import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DataSource } from 'typeorm';

jest.setTimeout(600_000); // migration setup takes >60s on slow machines

describe('Billing balance triggers (e2e)', () => {
  let dataSource: DataSource;

  // Helpers
  const createTempStorageRoot = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-e2e-'));
    return dir;
  };

  const getUserBalance = async (userId: number) => {
    const rows = await dataSource.manager.query('SELECT creditBalance FROM "user" WHERE id = ?', [userId]);
    return rows[0]?.creditBalance as number;
  };

  const createUser = async (username: string, email: string) => {
    await dataSource.manager.query('INSERT INTO "user" (username, email) VALUES (?, ?)', [username, email]);
    const idRow = await dataSource.manager.query('SELECT last_insert_rowid() as id');
    return idRow[0].id as number;
  };

  const createTransaction = async (userId: number, amount: number, status: 'pending' | 'completed' | 'failed') => {
    await dataSource.manager.query('INSERT INTO "billing_transaction" (userId, amount, status) VALUES (?, ?, ?)', [
      userId,
      amount,
      status,
    ]);
    const idRow = await dataSource.manager.query('SELECT last_insert_rowid() as id');
    return idRow[0].id as number;
  };

  beforeAll(async () => {
    const tmpRoot = await createTempStorageRoot();
    process.env.STORAGE_ROOT = tmpRoot;

    // Important: import after setting STORAGE_ROOT so datasource picks up the temp DB path
    const dsModule = await import('../database/datasource');
    dataSource = (dsModule as unknown as { default: DataSource }).default;

    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    // Ensure migrations are applied (safety, even though migrationsRun is true)
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('has the required triggers installed with correct names', async () => {
    const triggers = await dataSource.manager.query(
      "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name IN (?,?,?)",
      [
        'trg_billing_transaction_balance_after_insert',
        'trg_billing_transaction_balance_after_update',
        'trg_billing_transaction_balance_after_delete',
      ],
    );
    const triggerNames = new Set(triggers.map((t: { name: string }) => t.name));
    expect(triggerNames.has('trg_billing_transaction_balance_after_insert')).toBe(true);
    expect(triggerNames.has('trg_billing_transaction_balance_after_update')).toBe(true);
    expect(triggerNames.has('trg_billing_transaction_balance_after_delete')).toBe(true);

    // Basic sanity on trigger SQL to ensure we keep the completed-status guard
    const insertSql: string | undefined = triggers.find(
      (t: { name: string }) => t.name === 'trg_billing_transaction_balance_after_insert',
    )?.sql;
    const updateSql: string | undefined = triggers.find(
      (t: { name: string }) => t.name === 'trg_billing_transaction_balance_after_update',
    )?.sql;
    const deleteSql: string | undefined = triggers.find(
      (t: { name: string }) => t.name === 'trg_billing_transaction_balance_after_delete',
    )?.sql;
    expect(insertSql).toContain("NEW.status = 'completed'");
    expect(updateSql).toContain("OLD.status = 'completed'");
    expect(updateSql).toContain("NEW.status = 'completed'");
    expect(deleteSql).toContain("OLD.status = 'completed'");
  });

  it('updates user.creditBalance on INSERT/UPDATE/DELETE according to status and values', async () => {
    const userA = await createUser('user_a', 'user_a@example.com');
    const userB = await createUser('user_b', 'user_b@example.com');

    // Initial balances
    expect(await getUserBalance(userA)).toBe(0);
    expect(await getUserBalance(userB)).toBe(0);

    // INSERT completed adds amount
    const txCompleted = await createTransaction(userA, 100, 'completed');
    expect(await getUserBalance(userA)).toBe(100);

    // INSERT pending does NOT add amount
    const txPending = await createTransaction(userA, 50, 'pending');
    expect(await getUserBalance(userA)).toBe(100);

    // UPDATE: pending -> completed should add NEW.amount only
    await dataSource.manager.query('UPDATE "billing_transaction" SET status = ?, amount = ? WHERE id = ?', [
      'completed',
      50,
      txPending,
    ]);
    expect(await getUserBalance(userA)).toBe(150);

    // UPDATE: completed amount change should subtract OLD and add NEW (net -50)
    await dataSource.manager.query('UPDATE "billing_transaction" SET amount = ? WHERE id = ?', [50, txCompleted]); // OLD 100 -> NEW 50
    expect(await getUserBalance(userA)).toBe(100);

    // UPDATE: move completed transaction to different user (subtract from A, add to B)
    await dataSource.manager.query('UPDATE "billing_transaction" SET userId = ? WHERE id = ?', [userB, txCompleted]);
    expect(await getUserBalance(userA)).toBe(50);
    expect(await getUserBalance(userB)).toBe(50);

    // DELETE: deleting completed transaction subtracts from the respective user
    await dataSource.manager.query('DELETE FROM "billing_transaction" WHERE id = ?', [txCompleted]);
    expect(await getUserBalance(userA)).toBe(50);
    expect(await getUserBalance(userB)).toBe(0);

    // DELETE: deleting completed tx (the other one) subtracts
    await dataSource.manager.query('DELETE FROM "billing_transaction" WHERE id = ?', [txPending]);
    expect(await getUserBalance(userA)).toBe(0);
  });
});
