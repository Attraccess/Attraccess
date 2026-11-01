import { DataSource } from 'typeorm';
import { AttractapReaderUiCapabilities1792000000000 } from './1792000000000-attractap-reader-ui-capabilities';

describe('AttractapReaderUiCapabilities migration', () => {
  it('adds the columns, tolerates a rerun and keeps reader rows on rollback', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "attractap" (id integer PRIMARY KEY, name text NOT NULL)`);
      await runner.query(`INSERT INTO "attractap" (id, name) VALUES (1, 'press')`);

      const migration = new AttractapReaderUiCapabilities1792000000000();
      await migration.up(runner);
      await migration.up(runner); // already applied under the earlier migration name

      const [reader] = await runner.query(`SELECT * FROM "attractap"`);
      expect(reader).toMatchObject({ id: 1, firmwareCapabilitiesUi: null, firmwareCapabilitiesResetreason: null });

      await migration.down(runner);
      const [after] = await runner.query(`SELECT * FROM "attractap"`);
      expect(after).toEqual({ id: 1, name: 'press' });
    } finally {
      await runner.release();
      await database.destroy();
    }
  });
});
