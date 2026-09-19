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
});
