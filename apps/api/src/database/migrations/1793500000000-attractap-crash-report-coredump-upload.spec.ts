import { DataSource, QueryRunner } from 'typeorm';
import { AttractapCrashReportCoredumpUpload1793500000000 } from './1793500000000-attractap-crash-report-coredump-upload';

describe('Attractap crash report coredump upload migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const migration = new AttractapCrashReportCoredumpUpload1793500000000();

  const columns = async (): Promise<string[]> =>
    (await runner.query(`PRAGMA table_info("attractap_crash_report")`)).map((column: { name: string }) => column.name);

  beforeEach(async () => {
    source = await new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    await runner.query(
      `CREATE TABLE "attractap_crash_report" ("id" INTEGER PRIMARY KEY, "resetReason" TEXT NOT NULL, "coredumpSize" integer, "coredump" blob)`,
    );
    await runner.query(
      `INSERT INTO "attractap_crash_report" ("id", "resetReason", "coredumpSize", "coredump") VALUES (1, 'PANIC', 4, x'01020304'), (2, 'POWERON', NULL, NULL)`,
    );
  });
  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('marks reports with an inline dump as stored and leaves the others without a status', async () => {
    await migration.up(runner);
    expect(
      await runner.query(
        `SELECT "id", "coredumpStatus", "coredumpExpectedSize", "coredumpExpectedCrc32" FROM "attractap_crash_report" ORDER BY "id"`,
      ),
    ).toEqual([
      { id: 1, coredumpStatus: 'stored', coredumpExpectedSize: null, coredumpExpectedCrc32: null },
      { id: 2, coredumpStatus: null, coredumpExpectedSize: null, coredumpExpectedCrc32: null },
    ]);
  });

  it('removes the upload columns again and keeps the reports', async () => {
    await migration.up(runner);
    await migration.down(runner);
    expect(await columns()).toEqual(['id', 'resetReason', 'coredumpSize', 'coredump']);
    expect(await runner.query(`SELECT "id", "coredumpSize" FROM "attractap_crash_report" ORDER BY "id"`)).toEqual([
      { id: 1, coredumpSize: 4 },
      { id: 2, coredumpSize: null },
    ]);
  });
});
