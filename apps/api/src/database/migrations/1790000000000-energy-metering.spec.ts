import { DataSource, QueryRunner } from 'typeorm';
import { EnergyMetering1790000000000 } from './1790000000000-energy-metering';

describe('Energy metering migration', () => {
  let source: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE resource (id integer PRIMARY KEY)');
    await runner.query('CREATE TABLE resource_usage (id integer PRIMARY KEY)');
    await runner.query('CREATE TABLE resource_billing_configuration (id integer PRIMARY KEY, creditsPerUsage integer)');
    await runner.query('CREATE TABLE "user" (id integer PRIMARY KEY, creditBalance integer NOT NULL DEFAULT 0)');
    await runner.query(`CREATE TABLE billing_transaction (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL, userId integer NOT NULL,
      createdAt datetime NOT NULL DEFAULT (datetime('now')), updatedAt datetime NOT NULL DEFAULT (datetime('now')),
      amount integer NOT NULL, initiatorId integer, resourceUsageId integer, refundOfId integer,
      externalReference text, status varchar NOT NULL)`);
    await runner.query(`CREATE TRIGGER trg_billing_transaction_balance_after_delete AFTER DELETE ON billing_transaction
      BEGIN UPDATE "user" SET creditBalance = creditBalance - OLD.amount WHERE id = OLD.userId AND OLD.status = 'completed'; END`);
    await runner.query(`INSERT INTO "user" VALUES (1, 0)`);
    await runner.query(`INSERT INTO billing_transaction (id, userId, amount, status) VALUES (1, 1, 5, 'completed')`);
    await runner.query('CREATE TABLE billing_transaction_item (id integer PRIMARY KEY, unitPrice integer)');
    await runner.query('INSERT INTO resource_billing_configuration VALUES (1, 5)');
  });

  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('adds energy billing disabled by default and reverts cleanly', async () => {
    const migration = new EnergyMetering1790000000000();
    await migration.up(runner);

    expect(await runner.query('SELECT creditsPerKwh FROM resource_billing_configuration')).toEqual([
      { creditsPerKwh: 0 },
    ]);
    await runner.query('INSERT INTO resource (id) VALUES (1)');
    await runner.query('INSERT INTO resource_usage (id, energyCreditsPerKwh) VALUES (1, 30)');
    await runner.query(
      `INSERT INTO resource_metering_session (id, resourceId, usageId, status, creditsPerKwh) VALUES ('s', 1, 1, 'active', 30)`,
    );
    await runner.query(
      `INSERT INTO resource_metering_operation (id, sessionId, resourceId, kind, status, requestedAt) VALUES ('o', 's', 1, 'start', 'pending', datetime('now'))`,
    );
    await runner.query('PRAGMA foreign_keys = ON');
    await runner.query('DELETE FROM resource_usage WHERE id = 1');
    expect(await runner.query('SELECT * FROM resource_metering_session')).toEqual([]);
    expect(await runner.query('SELECT * FROM resource_metering_operation')).toEqual([]);

    await migration.down(runner);
    expect(await runner.query('SELECT * FROM resource_billing_configuration')).toEqual([{ id: 1, creditsPerUsage: 5 }]);
    expect(await runner.query("SELECT name FROM sqlite_master WHERE name LIKE 'resource_metering%'")).toEqual([]);
  });

  it('cascades a correction away with the transaction it corrects and keeps the balance triggers', async () => {
    const migration = new EnergyMetering1790000000000();
    await migration.up(runner);

    await runner.query(
      `INSERT INTO billing_transaction (id, userId, amount, status, correctionOfId) VALUES (2, 1, -3, 'completed', 1)`,
    );
    await runner.query('PRAGMA foreign_keys = ON');
    await runner.query('DELETE FROM billing_transaction WHERE id = 1');

    expect(await runner.query('SELECT id FROM billing_transaction')).toEqual([]);
    expect(await runner.query('SELECT creditBalance FROM "user"')).toEqual([{ creditBalance: -2 }]);

    await runner.query('PRAGMA foreign_keys = OFF');
    await migration.down(runner);
    expect(await runner.query("SELECT name FROM sqlite_master WHERE type = 'trigger'")).toEqual([
      { name: 'trg_billing_transaction_balance_after_delete' },
    ]);
  });
});
