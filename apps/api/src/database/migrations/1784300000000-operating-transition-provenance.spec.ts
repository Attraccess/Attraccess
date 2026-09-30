import { DataSource, QueryRunner } from 'typeorm';
import { ResourceOperatingInterval1783500000000 } from './1783500000000-resource-operating-interval';
import { OperatingTransitionProvenance1784300000000 } from './1784300000000-operating-transition-provenance';

describe('Operating transition provenance migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const migration = new OperatingTransitionProvenance1784300000000();

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE resource (id integer PRIMARY KEY)');
    await runner.query('INSERT INTO resource (id) VALUES (1)');
    await new ResourceOperatingInterval1783500000000().up(runner);
    await runner.query('INSERT INTO resource_operating_interval (resourceId, startTime, endTime) VALUES (1, ?, ?)', [
      '2026-09-19 12:00:00.123',
      '2026-09-19 12:01:00.456',
    ]);
  });

  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('keeps legacy provenance unknown and preserves interval precision and the one-open constraint', async () => {
    await migration.up(runner);

    expect(await runner.query('SELECT * FROM resource_operating_interval')).toEqual([
      expect.objectContaining({
        startTime: '2026-09-19 12:00:00.123',
        endTime: '2026-09-19 12:01:00.456',
        startFlowNodeId: null,
        startFlowRunId: null,
        endFlowNodeId: null,
        endFlowRunId: null,
      }),
    ]);
    await runner.query(
      'INSERT INTO resource_operating_interval (resourceId, startTime, startFlowNodeId, startFlowRunId) VALUES (1, ?, ?, ?)',
      ['2026-09-19 12:02:00.789', 'operating-node', 'flow-run'],
    );
    await expect(
      runner.query('INSERT INTO resource_operating_interval (resourceId, startTime) VALUES (1, ?)', [
        '2026-09-19 12:03:00.000',
      ]),
    ).rejects.toThrow('UNIQUE constraint failed');

    await migration.down(runner);

    expect(await runner.query('SELECT startTime, endTime FROM resource_operating_interval ORDER BY id')).toEqual([
      { startTime: '2026-09-19 12:00:00.123', endTime: '2026-09-19 12:01:00.456' },
      { startTime: '2026-09-19 12:02:00.789', endTime: null },
    ]);
  });

  it('indexes the latest-boundary lookup without sorting resource history and removes the index on rollback', async () => {
    await migration.up(runner);
    await runner.query(
      'INSERT INTO resource_operating_interval (resourceId, startTime, endTime) VALUES (1, ?, ?), (1, ?, ?)',
      ['2026-09-19 12:02:00.123', '2026-09-19 12:02:00.456', '2026-09-19 12:02:00.123', '2026-09-19 12:03:00.456'],
    );
    const lookup =
      'SELECT * FROM resource_operating_interval WHERE resourceId = ? ORDER BY startTime DESC, id DESC LIMIT 1';
    const plan: { detail: string }[] = await runner.query(`EXPLAIN QUERY PLAN ${lookup}`, [1]);

    expect(plan).toEqual([
      expect.objectContaining({
        detail: expect.stringContaining('USING INDEX IDX_resource_operating_interval_resourceId_startTime_id'),
      }),
    ]);
    expect(await runner.query(lookup, [1])).toEqual([
      expect.objectContaining({ id: 3, endTime: '2026-09-19 12:03:00.456' }),
    ]);

    await migration.down(runner);

    const indexes: { name: string }[] = await runner.query('PRAGMA index_list(resource_operating_interval)');
    expect(indexes.map(({ name }) => name)).not.toContain('IDX_resource_operating_interval_resourceId_startTime_id');
  });
});
