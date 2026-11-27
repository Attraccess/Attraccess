import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { postgresMigrations } from './index';
import { ResourceMeterArchive1796400000002 } from './1796400000002-resource-meter-archive';

jest.setTimeout(120_000);

describe('ResourceMeterArchive1796400000002 (persistence)', () => {
  let source: DataSource;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: postgresMigrations, migrationsRun: true });
    await source.query(`INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`);
  });
  afterEach(() => closeTestDataSource(source));

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await new ResourceMeterArchive1796400000002()[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const insert = (name: string, archived = false) =>
    source.query(
      `INSERT INTO resource_meter ("resourceId", name${archived ? ', "archivedAt"' : ''})
       VALUES (1, $1${archived ? ', now()' : ''})`,
      [name],
    );

  it('keeps existing meters active when upgrading', async () => {
    await run('down');
    await insert('Energy');
    await run('up');
    expect(await source.query(`SELECT name, "archivedAt" FROM resource_meter`)).toEqual([
      { name: 'Energy', archivedAt: null },
    ]);
  });

  it('makes a name unique among active meters only', async () => {
    await insert('Energy', true);
    await insert('Energy', true);
    await insert('Energy');
    await expect(insert('Energy')).rejects.toThrow(/IDX_resource_meter_name/);
    await expect(source.query(`UPDATE resource_meter SET "archivedAt" = NULL`)).rejects.toThrow(
      /IDX_resource_meter_name/,
    );
  });

  it('reverts without losing a meter: an archived one that shares a name is renamed', async () => {
    await insert('Energy', true);
    await insert('Water', true);
    await insert('Energy');

    await run('down');

    const names = await source.query(`SELECT id, name FROM resource_meter ORDER BY id`);
    expect(names.map((meter: { name: string }) => meter.name)).toEqual([
      `Energy (archived ${names[0].id})`,
      'Water',
      'Energy',
    ]);
    await expect(insert('Energy')).rejects.toThrow(/IDX_resource_meter_name/);
    await run('up');
  });
});
