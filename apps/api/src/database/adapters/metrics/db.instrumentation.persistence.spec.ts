import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry } from 'prom-client';
import type { DataSource } from 'typeorm';
import { createDbMetrics } from '../../../metrics/definitions/db.metrics';
import { MetricsToggleService } from '../../../metrics/settings/metrics-toggle.service';
import { resolveDatabaseBackend } from '../../backend';
import { DbMetricsInstrumentation } from './db.instrumentation';

/** Query timing covers the statements of unit-of-work transactions, which run on the serialized write connection. */
describe('DbMetricsInstrumentation on a real SQLite file', () => {
  const backend = resolveDatabaseBackend({ DATABASE_TYPE: 'sqlite' });
  let directory: string;
  let source: DataSource;
  let registry: Registry;
  let instrumentation: DbMetricsInstrumentation;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'db-instrumentation-'));
    source = await backend
      .createDataSource({
        type: 'better-sqlite3',
        invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
        database: join(directory, 'metrics.sqlite'),
      })
      .initialize();
    await source.query('CREATE TABLE widget (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    registry = new Registry();
    const toggle = {
      isEnabledCached: () => true,
      getSlowQueryThresholdSecondsCached: () => 10,
    } as unknown as MetricsToggleService;
    instrumentation = new DbMetricsInstrumentation(createDbMetrics(registry), toggle, source);
  });

  afterEach(async () => {
    await backend.shutdown(source);
    await source.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  const insertInUnitOfWork = async (name: string) => {
    const unitOfWork = backend.createUnitOfWork(source);
    await unitOfWork.run((scope) => unitOfWork.handleOf(scope).query('INSERT INTO widget (name) VALUES (?)', [name]));
  };
  const insertCount = async () =>
    (await registry.metrics()).match(
      /attraccess_db_query_duration_seconds_count\{entity="widget",method="insert"\} (\d+)/,
    )?.[1];

  it('times statements of a unit of work whose connection opens after the module started', async () => {
    instrumentation.onModuleInit();
    await insertInUnitOfWork('a');
    await insertInUnitOfWork('b');
    expect(await insertCount()).toBe('2');
  });

  it('times statements on a serialized write connection that was already open', async () => {
    await insertInUnitOfWork('before');
    instrumentation.onModuleInit();
    // The hook is applied to the open connection asynchronously.
    await new Promise((resolve) => setImmediate(resolve));
    await insertInUnitOfWork('after');
    expect(await insertCount()).toBe('1');
  });
});
