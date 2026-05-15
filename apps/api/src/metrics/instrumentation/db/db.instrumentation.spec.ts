// Unit tests for DbMetricsInstrumentation patching QueryRunner to record query timings
// FEATURE: Metrics — database query timing instrumentation
import { Registry } from 'prom-client';
import { DataSource, QueryRunner } from 'typeorm';
import { createDbMetrics } from '../../definitions/db.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';
import { DbMetricsInstrumentation, parseSql } from './db.instrumentation';

interface FakeRunner {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

interface FakeDriver {
  createQueryRunner: (mode: 'master' | 'slave') => FakeRunner;
  __attraccessDbMetricsPatched?: boolean;
}

describe('DbMetricsInstrumentation', () => {
  function setup(opts?: { enabled?: boolean; threshold?: number; queryImpl?: (sql: string, params?: unknown[]) => Promise<unknown> }) {
    const enabled = opts?.enabled ?? true;
    const threshold = opts?.threshold ?? 0.5;
    const queryImpl = opts?.queryImpl ?? (async () => []);
    const registry = new Registry();
    const metrics = createDbMetrics(registry);
    const toggle = {
      isEnabledCached: jest.fn().mockReturnValue(enabled),
      getSlowQueryThresholdSecondsCached: jest.fn().mockReturnValue(threshold),
    } as unknown as MetricsToggleService;
    const driver: FakeDriver = {
      createQueryRunner: () => ({ query: queryImpl }),
    };
    const dataSource = { driver } as unknown as DataSource;
    const instrumentation = new DbMetricsInstrumentation(metrics, toggle, dataSource);
    return { registry, metrics, toggle, dataSource, driver, instrumentation };
  }

  function makeRunner(driver: FakeDriver): QueryRunner {
    return driver.createQueryRunner('master') as unknown as QueryRunner;
  }

  it('patches the driver only once', () => {
    const { instrumentation, dataSource, driver } = setup();
    instrumentation.install(dataSource);
    const patched = driver.createQueryRunner;
    instrumentation.install(dataSource);
    expect(driver.createQueryRunner).toBe(patched);
  });

  it('does not double-wrap a cached runner across createQueryRunner calls', async () => {
    let queryCalls = 0;
    const cachedRunner: FakeRunner = {
      query: async () => {
        queryCalls += 1;
        return [];
      },
    };
    const registry = new Registry();
    const metrics = createDbMetrics(registry);
    const toggle = {
      isEnabledCached: jest.fn().mockReturnValue(true),
      getSlowQueryThresholdSecondsCached: jest.fn().mockReturnValue(0.5),
    } as unknown as MetricsToggleService;
    const driver: FakeDriver = {
      createQueryRunner: () => cachedRunner,
    };
    const dataSource = { driver } as unknown as DataSource;
    const instrumentation = new DbMetricsInstrumentation(metrics, toggle, dataSource);
    instrumentation.install(dataSource);

    for (let i = 0; i < 200; i += 1) {
      (driver.createQueryRunner('master') as unknown as QueryRunner);
    }
    await (cachedRunner.query as (sql: string) => Promise<unknown>)('SELECT * FROM "user"');

    expect(queryCalls).toBe(1);
    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="user",method="select"} 1');
  });

  it('records select duration with parsed entity from FROM clause', async () => {
    const { instrumentation, dataSource, driver, registry } = setup();
    instrumentation.install(dataSource);

    await makeRunner(driver).query('SELECT * FROM "user" WHERE "id" = ?', [1]);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="user",method="select"} 1');
  });

  it('records insert duration with parsed entity from INTO clause', async () => {
    const { instrumentation, dataSource, driver, registry } = setup();
    instrumentation.install(dataSource);

    await makeRunner(driver).query('INSERT INTO "session" ("id") VALUES (?)', [1]);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="session",method="insert"} 1');
  });

  it('records update duration with parsed entity', async () => {
    const { instrumentation, dataSource, driver, registry } = setup();
    instrumentation.install(dataSource);

    await makeRunner(driver).query('UPDATE "resource" SET "name" = ? WHERE "id" = ?', ['x', 1]);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="resource",method="update"} 1');
  });

  it('records delete duration with parsed entity', async () => {
    const { instrumentation, dataSource, driver, registry } = setup();
    instrumentation.install(dataSource);

    await makeRunner(driver).query('DELETE FROM "session" WHERE "id" = ?', [1]);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="session",method="delete"} 1');
  });

  it('skips housekeeping verbs (BEGIN, COMMIT, PRAGMA, ...)', async () => {
    const { instrumentation, dataSource, driver, registry } = setup();
    instrumentation.install(dataSource);

    await makeRunner(driver).query('BEGIN TRANSACTION');
    await makeRunner(driver).query('COMMIT');
    await makeRunner(driver).query('PRAGMA foreign_keys = ON');

    const text = await registry.metrics();
    expect(text).not.toMatch(/attraccess_db_query_duration_seconds_count\{/);
  });

  it('emits no series when toggle is disabled', async () => {
    const { instrumentation, dataSource, driver, registry } = setup({ enabled: false });
    instrumentation.install(dataSource);

    await makeRunner(driver).query('SELECT * FROM "user"');

    const text = await registry.metrics();
    expect(text).not.toMatch(/attraccess_db_query_duration_seconds_count\{/);
  });

  it('increments slow queries counter when duration exceeds threshold', async () => {
    let resolveQuery: (() => void) | null = null;
    const queryImpl = () =>
      new Promise<unknown>((resolve) => {
        resolveQuery = () => resolve([]);
      });
    const { instrumentation, dataSource, driver, metrics } = setup({ threshold: 0, queryImpl });
    instrumentation.install(dataSource);
    const slowSpy = jest.spyOn(metrics.slowQueriesTotal, 'inc');

    const promise = makeRunner(driver).query('SELECT * FROM "user"');
    await new Promise((r) => setTimeout(r, 5));
    resolveQuery?.();
    await promise;

    expect(slowSpy).toHaveBeenCalledWith({ entity: 'user', method: 'select' });
  });

  it('records error and observes duration when query throws', async () => {
    const queryImpl = () => Promise.reject(Object.assign(new Error('boom'), { code: 'SQLITE_BUSY' }));
    const { instrumentation, dataSource, driver, registry } = setup({ queryImpl });
    instrumentation.install(dataSource);

    await expect(makeRunner(driver).query('SELECT * FROM "user"')).rejects.toThrow('boom');

    const text = await registry.metrics();
    expect(text).toContain('attraccess_db_query_errors_total{entity="user",method="select",error_type="SQLITE_BUSY"} 1');
    expect(text).toContain('attraccess_db_query_duration_seconds_count{entity="user",method="select"} 1');
  });

  describe('parseSql', () => {
    it('parses SELECT with quoted table name', () => {
      expect(parseSql('SELECT * FROM "user"')).toEqual({ method: 'select', entity: 'user', observable: true });
    });
    it('parses SELECT with unquoted table name', () => {
      expect(parseSql('SELECT * FROM resource')).toEqual({ method: 'select', entity: 'resource', observable: true });
    });
    it('parses INSERT', () => {
      expect(parseSql('INSERT INTO "session" ("id") VALUES (?)')).toEqual({
        method: 'insert',
        entity: 'session',
        observable: true,
      });
    });
    it('parses UPDATE', () => {
      expect(parseSql('UPDATE "user" SET "name" = ?')).toEqual({ method: 'update', entity: 'user', observable: true });
    });
    it('parses DELETE FROM', () => {
      expect(parseSql('DELETE FROM "user" WHERE "id" = ?')).toEqual({
        method: 'delete',
        entity: 'user',
        observable: true,
      });
    });
    it('marks BEGIN as not observable', () => {
      expect(parseSql('BEGIN TRANSACTION').observable).toBe(false);
    });
    it('marks PRAGMA as not observable', () => {
      expect(parseSql('PRAGMA foreign_keys = ON').observable).toBe(false);
    });
    it('treats REPLACE INTO as insert', () => {
      expect(parseSql('REPLACE INTO "user" ("id") VALUES (?)')).toEqual({
        method: 'insert',
        entity: 'user',
        observable: true,
      });
    });
    it('returns method=other and entity=unknown for unrecognized statements', () => {
      expect(parseSql('CREATE TABLE x (id INTEGER)')).toEqual({ method: 'other', entity: 'unknown', observable: true });
    });
  });
});
