import type { DataSource } from 'typeorm';
import { AttractapCrashReport } from '@attraccess/database-entities';
import { closeTestDataSource, createTestDataSource } from '../test-utils/test-database';
import { MetricsService } from './metrics.service';
import { RESET_REPORT_COUNT_DEADLINE_MS, ResetReportMetricsCollector } from './reset-report-metrics.collector';
import {
  TypeOrmResetReportCountReader,
  resetReportBounds,
  resetReportCountSql,
} from '../database/adapters/metrics/typeorm-metrics-readers';
import {
  CRASH_WATCHDOG_REASONS,
  MAX_READERS_TEXT_LENGTH,
  POWER_ON_REASONS,
  describeReaders,
  hourWindow,
} from './reset-report-metrics';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');

function ago(seconds: number, millis = ''): string {
  return `${new Date(NOW - seconds * 1000).toISOString().slice(0, 19).replace('T', ' ')}${millis}`;
}

describe('ResetReportMetricsCollector', () => {
  let source: DataSource;
  let gauges: Pick<MetricsService, 'attractapResetReportsLastHour' | 'attractapResetReportReadersLastHour'>;
  let collector: ResetReportMetricsCollector;
  let nextId = 1;

  const registry = new (jest.requireActual('prom-client').Registry)();
  const { Gauge } = jest.requireActual('prom-client');

  async function insert(reader: number, reason: string, createdAt: string) {
    await source.query(
      `INSERT INTO attractap_crash_report (id, "attractapId", "resetReason", "createdAt") VALUES ($1, $2, $3, $4)`,
      [nextId++, reader, reason, createdAt],
    );
  }

  async function values() {
    const counts = await gauges.attractapResetReportsLastHour.get();
    return Object.fromEntries(counts.values.map((v) => [v.labels['category'], v.value]));
  }

  beforeEach(async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });
    source = await createTestDataSource();
    await source.query(`INSERT INTO attractap (id, name) VALUES (1, 'Door'), (2, 'Laser')`);
    registry.clear();
    gauges = {
      attractapResetReportsLastHour: new Gauge({
        name: 'a',
        help: 'a',
        labelNames: ['category'],
        registers: [registry],
      }),
      attractapResetReportReadersLastHour: new Gauge({
        name: 'b',
        help: 'b',
        labelNames: ['category', 'readers'],
        registers: [registry],
      }),
    };
    collector = new ResetReportMetricsCollector(
      { ...gauges, registerRefresher: jest.fn() } as unknown as MetricsService,
      new TypeOrmResetReportCountReader(source.getRepository(AttractapCrashReport)),
    );
    nextId = 1;
  });

  afterEach(async () => {
    jest.useRealTimers();
    await closeTestDataSource(source);
  });

  it('excludes a report exactly one hour old and includes one second newer', async () => {
    await insert(1, 'PANIC', ago(3600));
    await insert(1, 'PANIC', ago(3600, '.500'));
    await insert(1, 'PANIC', ago(3599));
    await collector.refresh();
    expect(await values()).toEqual({ crash_watchdog: 1, power_on: 0 });
  });

  it('applies the boundary in whole seconds when collection time has milliseconds', async () => {
    jest.setSystemTime(NOW + 700);
    await insert(1, 'PANIC', ago(3600, '.999'));
    await insert(1, 'PANIC', ago(3599, '.001'));
    await insert(1, 'PANIC', ago(0, '.900'));
    await collector.refresh();
    expect(await values()).toEqual({ crash_watchdog: 2, power_on: 0 });
  });

  it('includes reports received at collection time, with or without milliseconds', async () => {
    await insert(1, 'POWERON', ago(0));
    await insert(2, 'POWERON', ago(0, '.250'));
    await collector.refresh();
    expect(await values()).toEqual({ crash_watchdog: 0, power_on: 2 });
  });

  it.each([
    ['PANIC', 'crash_watchdog'],
    ['INT_WDT', 'crash_watchdog'],
    ['TASK_WDT', 'crash_watchdog'],
    ['WDT', 'crash_watchdog'],
    ['POWERON', 'power_on'],
  ])('counts %s as %s', async (reason, category) => {
    await insert(1, reason, ago(10));
    await collector.refresh();
    expect((await values())[category]).toBe(1);
  });

  it.each(['SW', 'BROWNOUT', 'UNKNOWN', 'EXT', 'DEEPSLEEP', 'SDIO'])('ignores %s', async (reason) => {
    await insert(1, reason, ago(10));
    await collector.refresh();
    expect(await values()).toEqual({ crash_watchdog: 0, power_on: 0 });
  });

  it('describes readers and reasons sorted', async () => {
    await insert(2, 'TASK_WDT', ago(10));
    await insert(1, 'PANIC', ago(10));
    await insert(1, 'PANIC', ago(20));
    await insert(1, 'WDT', ago(20));
    await collector.refresh();
    const series = (await gauges.attractapResetReportReadersLastHour.get()).values;
    expect(series).toHaveLength(1);
    expect(series[0].labels).toEqual({
      category: 'crash_watchdog',
      readers: 'Door (#1): PANIC x2, WDT x1; Laser (#2): TASK_WDT x1',
    });
    expect(series[0].value).toBe(4);
  });

  it('removes series that left the window', async () => {
    await insert(1, 'POWERON', ago(10));
    await collector.refresh();
    expect((await gauges.attractapResetReportReadersLastHour.get()).values).toHaveLength(1);
    await source.query('DELETE FROM attractap_crash_report');
    await collector.refresh();
    expect((await gauges.attractapResetReportReadersLastHour.get()).values).toHaveLength(0);
    expect(await values()).toEqual({ crash_watchdog: 0, power_on: 0 });
  });

  it('fails instead of reporting zero when the database fails', async () => {
    await source.query('DROP TABLE attractap_crash_report');
    await expect(collector.refresh()).rejects.toThrow();
  });

  it('fails after five seconds, joins the still-running count instead of starting another, then recovers', async () => {
    expect(RESET_REPORT_COUNT_DEADLINE_MS).toBe(5000);
    let finish: (rows: unknown[]) => void = () => undefined;
    const repo = { query: jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))) };
    const slow = new ResetReportMetricsCollector(
      { ...gauges, registerRefresher: jest.fn() } as unknown as MetricsService,
      new TypeOrmResetReportCountReader(repo as never),
    );
    jest.useFakeTimers({ now: NOW });
    const first = slow.refresh();
    let firstSettled = false;
    first.catch(() => undefined).finally(() => (firstSettled = true));
    await jest.advanceTimersByTimeAsync(4999);
    expect(firstSettled).toBe(false);
    const failed = expect(first).rejects.toThrow(/exceeded/);
    await jest.advanceTimersByTimeAsync(1);
    await failed;

    const second = expect(slow.refresh()).rejects.toThrow(/exceeded/);
    await jest.advanceTimersByTimeAsync(RESET_REPORT_COUNT_DEADLINE_MS);
    await second;
    expect(repo.query).toHaveBeenCalledTimes(1);

    finish([]);
    await jest.advanceTimersByTimeAsync(0);
    repo.query.mockResolvedValue([]);
    await expect(slow.refresh()).resolves.toBeUndefined();
    expect(repo.query).toHaveBeenCalledTimes(2);
  });

  it('runs one count at a time', async () => {
    const query = jest.spyOn(source.getRepository(AttractapCrashReport), 'query');
    const repo = source.getRepository(AttractapCrashReport);
    const shared = new ResetReportMetricsCollector(
      { ...gauges, registerRefresher: jest.fn() } as unknown as MetricsService,
      new TypeOrmResetReportCountReader(repo),
    );
    await Promise.all([shared.refresh(), shared.refresh()]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('strips HTML brackets from reader names and caps the reader list', () => {
    expect(describeReaders([{ attractapId: 1, readerName: '<b>Door</b>', resetReason: 'PANIC', count: 4 }])).toBe(
      'bDoor/b (#1): PANIC x4',
    );
    const many = Array.from({ length: 30 }, (_, i) => ({
      attractapId: i + 1,
      readerName: `Workshop reader with a rather long name ${String(i).padStart(2, '0')}`,
      resetReason: 'PANIC',
      count: 1,
    }));
    const text = describeReaders(many);
    expect(text.length).toBeLessThanOrEqual(MAX_READERS_TEXT_LENGTH + '; +30 more'.length);
    expect(text).toMatch(/; \+\d+ more$/);
    expect(text).toContain('Workshop reader with a rather long name… (#1): PANIC x1');
  });
});

describe('reset report count query on the migrated schema', () => {
  let source: DataSource;

  beforeAll(async () => {
    source = await createTestDataSource();
  }, 60_000);

  afterAll(async () => {
    await closeTestDataSource(source);
  });

  it('uses the createdAt index for the real hourly count query', async () => {
    const { from, to } = resetReportBounds(hourWindow(NOW));
    const reasons = [...CRASH_WATCHDOG_REASONS, ...POWER_ON_REASONS];
    const runner = source.createQueryRunner();
    try {
      // The planner prefers a sequential scan of an empty table; the question is whether the index can serve it.
      await runner.query('SET enable_seqscan = off');
      const plan = (await runner.query(`EXPLAIN ${resetReportCountSql()}`, [from, to, reasons])) as Array<
        Record<string, string>
      >;
      const details = plan.map((row) => Object.values(row)[0]).join(' ');
      expect(details).toContain('IDX_attractap_crash_report_created_at');
      expect(details).not.toMatch(/Seq Scan on attractap_crash_report/);
    } finally {
      await runner.release();
    }
  });
});

describe('MetricsModule wiring', () => {
  it('provides the collector, so /api/metrics publishes the reset-report gauges', () => {
    // Imported lazily: the module file pulls in Nest/TypeORM decorators the tests above do not need.
    const { MetricsModule } = jest.requireActual('./metrics.module');
    const providers = Reflect.getMetadata('providers', MetricsModule) as unknown[];
    expect(providers).toContain(ResetReportMetricsCollector);
  });
});
