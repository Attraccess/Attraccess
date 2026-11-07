import { DataSource } from 'typeorm';
import { AttractapCardRelayCapability1792500000000 } from './1792500000000-attractap-card-relay-capability';

describe('AttractapCardRelayCapability migration', () => {
  it('marks existing and new readers as not relaying card APDUs until they report it, and can be reverted', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "attractap" (id integer PRIMARY KEY, name varchar NOT NULL)`);
      await runner.query(`INSERT INTO "attractap" (id, name) VALUES (1, 'Lathe')`);
      const migration = new AttractapCardRelayCapability1792500000000();

      await migration.up(runner);
      await runner.query(`INSERT INTO "attractap" (id, name) VALUES (2, 'Door')`);
      expect(await runner.query(`SELECT * FROM "attractap" ORDER BY id`)).toEqual([
        { id: 1, name: 'Lathe', firmwareCapabilitiesCardrelay: 0 },
        { id: 2, name: 'Door', firmwareCapabilitiesCardrelay: 0 },
      ]);

      await migration.down(runner);
      expect(await runner.query(`SELECT * FROM "attractap" ORDER BY id`)).toEqual([
        { id: 1, name: 'Lathe' },
        { id: 2, name: 'Door' },
      ]);
    } finally {
      await runner.release();
      await database.destroy();
    }
  });

  it('keeps an existing column and its values when the migration ran before under an earlier name', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "attractap" (id integer PRIMARY KEY, name varchar NOT NULL)`);
      const migration = new AttractapCardRelayCapability1792500000000();
      await migration.up(runner);
      await runner.query(`INSERT INTO "attractap" (id, name, firmwareCapabilitiesCardrelay) VALUES (1, 'Lathe', 1)`);

      await migration.up(runner);

      expect(await runner.query(`SELECT * FROM "attractap"`)).toEqual([
        { id: 1, name: 'Lathe', firmwareCapabilitiesCardrelay: 1 },
      ]);

      await migration.down(runner);
      await migration.down(runner); // nothing left to drop
      expect(await runner.query(`SELECT * FROM "attractap"`)).toEqual([{ id: 1, name: 'Lathe' }]);
    } finally {
      await runner.release();
      await database.destroy();
    }
  });
});
