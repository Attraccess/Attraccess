import { Registry } from 'prom-client';
import type { DataSource } from 'typeorm';
import { createDbMetrics } from '../../../metrics/definitions/db.metrics';
import { MetricsToggleService } from '../../../metrics/settings/metrics-toggle.service';
import { resolveDatabaseBackend } from '../../backend';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { DbMetricsInstrumentation } from './db.instrumentation';

/** Query timing covers the statements of unit-of-work transactions. */
describe('DbMetricsInstrumentation on a real PostgreSQL database', () => {
  const backend = resolveDatabaseBackend();
  let source: DataSource;
  let registry: Registry;
  let instrumentation: DbMetricsInstrumentation;

  beforeEach(async () => {
    source = await createTestDataSource({ empty: true, entities: [] });
    await source.query('CREATE TABLE widget (id SERIAL PRIMARY KEY, name TEXT NOT NULL)');
    registry = new Registry();
    const toggle = {
      isEnabledCached: () => true,
      getSlowQueryThresholdSecondsCached: () => 10,
    } as unknown as MetricsToggleService;
    instrumentation = new DbMetricsInstrumentation(createDbMetrics(registry), toggle, source);
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  const insertInUnitOfWork = async (name: string) => {
    const unitOfWork = backend.createUnitOfWork(source);
    await unitOfWork.run((scope) => unitOfWork.handleOf(scope).query('INSERT INTO widget (name) VALUES ($1)', [name]));
  };
  const insertCount = async () =>
    (await registry.metrics()).match(
      /attraccess_db_query_duration_seconds_count\{entity="widget",method="insert"\} (\d+)/,
    )?.[1];

  it('times statements of a unit of work', async () => {
    instrumentation.onModuleInit();
    await insertInUnitOfWork('a');
    await insertInUnitOfWork('b');
    expect(await insertCount()).toBe('2');
  });

  it('times only the statements after the instrumentation was installed', async () => {
    await insertInUnitOfWork('before');
    instrumentation.onModuleInit();
    await insertInUnitOfWork('after');
    expect(await insertCount()).toBe('1');
  });
});
