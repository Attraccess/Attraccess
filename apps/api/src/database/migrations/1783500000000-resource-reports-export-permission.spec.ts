import { QueryRunner } from 'typeorm';
import { ResourceReportsExportPermission1783500000000 } from './1783500000000-resource-reports-export-permission';

describe('Resource reports export permission migration', () => {
  const query = jest.fn();
  const queryRunner = { query } as unknown as QueryRunner;
  const migration = new ResourceReportsExportPermission1783500000000();

  beforeEach(() => {
    query.mockReset();
  });

  it('seeds the dedicated export permission for administrators', async () => {
    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO "permission"'), [
      'resources.reports.export',
      'Export Resource Reports',
      expect.any(String),
      'resources',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining(`WHERE "key" = 'administrator'`), [
      'resources.reports.export',
    ]);
  });
});
