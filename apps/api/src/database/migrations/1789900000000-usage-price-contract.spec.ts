import { DataSource, QueryRunner } from 'typeorm';
import { UsagePriceContract1789900000000 } from './1789900000000-usage-price-contract';

describe('Usage price contract migration', () => {
  let source: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE resource_usage (id integer PRIMARY KEY, endTime datetime)');
    await runner.query(
      'CREATE TABLE billing_transaction_item (id integer PRIMARY KEY, unitPrice integer, quantity integer)',
    );
    await runner.query("INSERT INTO resource_usage VALUES (1, '2026-09-20 09:06:00.123'), (2, NULL)");
    await runner.query('INSERT INTO billing_transaction_item VALUES (1, 7, 2)');
  });

  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('leaves historical prices unknown and existing bill amounts unchanged across up/down', async () => {
    const migration = new UsagePriceContract1789900000000();
    await migration.up(runner);

    expect(await runner.query('SELECT creditsPerUsage, billingFactor FROM resource_usage ORDER BY id')).toEqual([
      { creditsPerUsage: null, billingFactor: null },
      { creditsPerUsage: null, billingFactor: null },
    ]);
    expect(await runner.query('SELECT * FROM billing_transaction_item')).toEqual([
      { id: 1, unitPrice: 7, quantity: 2, durationMs: null },
    ]);
    await runner.query('INSERT INTO resource_usage (id, creditsPerUsage, billingFactor) VALUES (3, 0, 0)');
    await runner.query('INSERT INTO billing_transaction_item VALUES (2, 7, 2, 60001)');
    expect(await runner.query('SELECT creditsPerUsage, billingFactor FROM resource_usage WHERE id = 3')).toEqual([
      { creditsPerUsage: 0, billingFactor: 0 },
    ]);
    expect(await runner.query('SELECT durationMs FROM billing_transaction_item WHERE id = 2')).toEqual([
      { durationMs: 60001 },
    ]);

    await migration.down(runner);

    expect(await runner.query('SELECT * FROM billing_transaction_item ORDER BY id')).toEqual([
      { id: 1, unitPrice: 7, quantity: 2 },
      { id: 2, unitPrice: 7, quantity: 2 },
    ]);
    expect(await runner.query('SELECT endTime FROM resource_usage WHERE id = 1')).toEqual([
      { endTime: '2026-09-20 09:06:00.123' },
    ]);
  });
});
