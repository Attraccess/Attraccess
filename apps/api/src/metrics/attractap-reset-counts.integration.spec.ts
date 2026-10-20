import { Attractap, AttractapCrashReport, entities } from '@attraccess/database-entities';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MetricsService } from './metrics.service';
import { normalizeResetReason } from './reset-reason';
import { AttractapCrashReportCreatedIndex1791600000000 } from '../database/migrations/1791600000000-attractap-crash-report-created-index';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const HOUR = 3_600_000;
const METRIC = 'attraccess_attractap_reset_reports_last_hour';

describe('database-backed hourly reset counts', () => {
  let db: DataSource;
  let repo: Repository<AttractapCrashReport>;
  let service: MetricsService;

  async function createService() {
    const module = await Test.createTestingModule({
      providers: [MetricsService],
    })
      .useMocker((token) => (token === getRepositoryToken(AttractapCrashReport) ? repo : {}))
      .compile();
    return module.get(MetricsService);
  }

  async function report(reader: number, reason: string, time = NOW.getTime()) {
    // Foreign keys are exercised separately below. Keep all other fixtures minimal.
    await repo.insert({ attractapId: reader, resetReason: reason, createdAt: new Date(time) });
  }

  async function counts() {
    await service.getMetrics();
    return (await service.attractapResetReportsLastHour.get()).values;
  }

  beforeAll(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    repo = db.getRepository(AttractapCrashReport);
    await db.query('PRAGMA foreign_keys = OFF');
  }, 30_000);

  beforeEach(async () => {
    await repo.clear();
    // Freeze only the wall clock: registry collection and SQLite retain real timers.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'performance',
        'hrtime',
        'queueMicrotask',
      ],
    });
    service = await createService();
  });

  afterEach(() => jest.useRealTimers());
  afterAll(async () => db.destroy());

  it('keeps three POWERON reports exact across readers 5 and 10, independent of the counter', async () => {
    await report(5, 'POWERON');
    await report(5, 'POWERON');
    await report(10, 'POWERON');
    service.attractapCrashReportsTotal.inc({ reader_id: '5', reset_reason: 'POWERON' }, 900);
    expect(await counts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labels: { reader_id: '5', reset_reason: 'POWERON' }, value: 2 }),
        expect.objectContaining({ labels: { reader_id: '10', reset_reason: 'POWERON' }, value: 1 }),
      ]),
    );
    expect((await counts()).reduce((n, row) => n + row.value, 0)).toBe(3);
    await report(10, 'POWERON');
    expect((await counts()).reduce((n, row) => n + row.value, 0)).toBe(4);
  });

  it('exposes no contributor series for an empty database and keeps mixed categories separate', async () => {
    expect(await counts()).toEqual([]);
    for (const [reader, reason] of [
      [5, 'PANIC'],
      [10, 'INT_WDT'],
      [10, 'TASK_WDT'],
      [5, 'POWERON'],
      [5, 'POWERON'],
      [10, 'POWERON'],
    ] as const) {
      await report(reader, reason);
    }
    const categoryTotal = (values: Awaited<ReturnType<typeof counts>>, reasons: string[]) =>
      values
        .filter((row) => reasons.includes(String(row.labels.reset_reason)))
        .reduce((sum, row) => sum + row.value, 0);
    expect(categoryTotal(await counts(), ['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT'])).toBe(3);
    expect(categoryTotal(await counts(), ['POWERON'])).toBe(3);
    await report(5, 'WDT');
    expect(categoryTotal(await counts(), ['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT'])).toBe(4);
    expect(categoryTotal(await counts(), ['POWERON'])).toBe(3);
  });

  it('uses an open lower and closed upper boundary and excludes future reports', async () => {
    for (const delta of [-HOUR - 1, -HOUR, -HOUR + 1, 0, 1]) await report(5, 'PANIC', NOW.getTime() + delta);
    expect(await counts()).toEqual([expect.objectContaining({ value: 2 })]);
  });

  it('preserves every allowed reason and merges unknown raw values into bounded labels', async () => {
    const reasons = [
      'POWERON',
      'EXT',
      'SW',
      'PANIC',
      'INT_WDT',
      'TASK_WDT',
      'WDT',
      'DEEPSLEEP',
      'BROWNOUT',
      'SDIO',
      'UNKNOWN',
    ];
    for (const reason of reasons) {
      expect(normalizeResetReason(reason)).toBe(reason);
      await report(5, reason);
    }
    await report(5, 'private diagnostic');
    await report(5, 'panic');
    expect(normalizeResetReason(null)).toBe('UNKNOWN');
    const values = await counts();
    expect(values).toHaveLength(reasons.length);
    expect(values.find((v) => v.labels.reset_reason === 'UNKNOWN')?.value).toBe(3);
    expect(await service.getMetrics()).not.toContain('private diagnostic');
  });

  it('recovers persisted counts after restart and removes expired and deleted reports', async () => {
    await report(5, 'PANIC');
    await counts();
    service = await createService();
    expect(await counts()).toEqual([expect.objectContaining({ value: 1 })]);
    await repo
      .createQueryBuilder()
      .update()
      .set({ createdAt: new Date(NOW.getTime() - HOUR) })
      .execute();
    expect(await counts()).toEqual([]);
    await report(10, 'POWERON');
    await counts();
    await repo.delete({ attractapId: 10 });
    expect(await counts()).toEqual([]);
  });

  it('removes series when deleting a reader cascades to its reports', async () => {
    await db.getRepository(Attractap).insert({ id: 5, name: 'test', apiTokenHash: 'test' });
    await db.query('PRAGMA foreign_keys = ON');
    try {
      await report(5, 'PANIC');
      await counts();
      await db.getRepository('Attractap').delete(5);
      expect(await counts()).toEqual([]);
    } finally {
      await db.query('PRAGMA foreign_keys = OFF');
    }
  });

  it('serializes overlapping refreshes through rendering and recovers after query failure', async () => {
    await report(5, 'POWERON');
    const original = repo.createQueryBuilder.bind(repo);
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const render = jest.spyOn(service.registry, 'metrics');
    render.mockImplementationOnce(async () => {
      await gate;
      return 'first coherent scrape';
    });
    const query = jest.spyOn(repo, 'createQueryBuilder').mockImplementation(original);
    const first = service.getMetrics();
    while (!render.mock.calls.length) await new Promise((resolve) => setTimeout(resolve, 5));
    const second = service.getMetrics();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(query).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe('first coherent scrape');
    expect(await second).toContain(`${METRIC}{reader_id="5",reset_reason="POWERON"} 1`);
    query.mockImplementationOnce(() => {
      throw new Error('database unavailable');
    });
    await expect(service.getMetrics()).rejects.toThrow('database unavailable');
    expect(await service.getMetrics()).toContain(`${METRIC}{reader_id="5",reset_reason="POWERON"} 1`);
    query.mockRestore();
  });

  it('uses the reversible timestamp index and measures collection with historical rows', async () => {
    const migration = new AttractapCrashReportCreatedIndex1791600000000();
    const runner = db.createQueryRunner();
    await migration.down(runner);
    expect(
      (await runner.getTable('attractap_crash_report')).indices.some(
        (i) => i.name === 'IDX_attractap_crash_report_created',
      ),
    ).toBe(false);
    await migration.up(runner);
    await db.query(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100000)
      INSERT INTO attractap_crash_report (attractapId, resetReason, createdAt)
      SELECT 5, 'SW', '2025-01-01 00:00:00.000' FROM n`);
    await report(5, 'PANIC');
    const queries: string[] = [];
    const spy = jest.spyOn(repo, 'createQueryBuilder');
    spy.mockImplementation((alias) => {
      const qb = db.createQueryBuilder(AttractapCrashReport, alias);
      const get = qb.getRawMany.bind(qb);
      qb.getRawMany = async () => {
        const [sql, params] = qb.getQueryAndParameters();
        const plan = await db.query(`EXPLAIN QUERY PLAN ${sql}`, params);
        expect(JSON.stringify(plan)).toContain(
          'USING INDEX IDX_attractap_crash_report_created (createdAt>? AND createdAt<?)',
        );
        expect(sql).not.toContain('coredump');
        const start = performance.now();
        const result = await get();
        queries.push(`${JSON.stringify(plan)}; query=${(performance.now() - start).toFixed(2)}ms`);
        return result;
      };
      return qb;
    });
    const start = performance.now();
    await service.getMetrics();
    process.stdout.write(
      `100000 historical rows: ${queries.join('; ')}; scrape=${(performance.now() - start).toFixed(2)}ms; Prometheus default scrape_timeout=10s\n`,
    );
    spy.mockRestore();
    await runner.release();
  });
});
