import { DataSource, QueryRunner } from 'typeorm';
import { Logger } from '@nestjs/common';
import { LowercaseEmails1792900000000 } from './1792900000000-lowercase-emails';

describe('LowercaseEmails migration', () => {
  let database: DataSource;
  let runner: QueryRunner;

  const seed = async (rows: Array<[number, string, number]>) => {
    for (const [id, email, verified] of rows) {
      await runner.query(`INSERT INTO "user" (id, email, isEmailVerified) VALUES (?, ?, ?)`, [id, email, verified]);
    }
  };
  const emails = async (): Promise<Record<number, { email: string; verified: number }>> => {
    const rows: Array<{ id: number; email: string; isEmailVerified: number }> =
      await runner.query(`SELECT * FROM "user"`);
    return Object.fromEntries(rows.map((r) => [r.id, { email: r.email, verified: r.isEmailVerified }]));
  };

  beforeEach(async () => {
    database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = database.createQueryRunner();
    await runner.query(
      `CREATE TABLE "user" (id integer PRIMARY KEY, email text NOT NULL UNIQUE, isEmailVerified boolean NOT NULL DEFAULT 0)`,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await runner.release();
    await database.destroy();
  });

  it('lowercases and trims rows outside duplicate groups, including non-ASCII', async () => {
    await seed([
      [1, 'Alex@Example.COM', 0],
      [2, ' Ünal@Example.com ', 1],
      [3, 'plain@example.com', 0],
    ]);
    await new LowercaseEmails1792900000000().up(runner);
    const result = await emails();
    expect(result[1].email).toBe('alex@example.com');
    expect(result[2].email).toBe('ünal@example.com');
    expect(result[3].email).toBe('plain@example.com');
  });

  it('keeps the verified account, then the lowest id, and parks the others without touching verification', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await seed([
      [1, 'Dup@example.com', 0],
      [2, 'dup@example.com', 1],
      [3, 'DUP@example.com', 1],
      [4, 'Other@example.com', 0],
      [5, 'other@example.com', 0],
      [6, 'other@EXAMPLE.com', 0],
    ]);
    await new LowercaseEmails1792900000000().up(runner);
    expect(await emails()).toEqual({
      1: { email: 'duplicate-1@duplicate-email.invalid', verified: 0 },
      2: { email: 'dup@example.com', verified: 1 },
      3: { email: 'duplicate-3@duplicate-email.invalid', verified: 1 },
      4: { email: 'other@example.com', verified: 0 },
      5: { email: 'duplicate-5@duplicate-email.invalid', verified: 0 },
      6: { email: 'duplicate-6@duplicate-email.invalid', verified: 0 },
    });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('kept user 2, parked users 1, 3');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('example.com');
  });

  it('down is a no-op', async () => {
    await seed([[1, 'a@example.com', 0]]);
    await new LowercaseEmails1792900000000().down();
    expect((await emails())[1].email).toBe('a@example.com');
  });
});
