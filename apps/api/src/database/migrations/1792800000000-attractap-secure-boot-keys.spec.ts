import { DataSource } from 'typeorm';
import { AttractapSecureBootKeys1792800000000 } from './1792800000000-attractap-secure-boot-keys';

describe('AttractapSecureBootKeys migration', () => {
  it('adds the key table and the per-reader columns without touching readers, and rolls back', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "attractap" (id integer PRIMARY KEY, name text NOT NULL)`);
      await runner.query(`INSERT INTO "attractap" (id, name) VALUES (1, 'press')`);

      const migration = new AttractapSecureBootKeys1792800000000();
      await migration.up(runner);
      await migration.up(runner); // re-applying after a rollback must not fail

      expect(await runner.query(`SELECT * FROM "attractap"`)).toEqual([
        { id: 1, name: 'press', secureBootDigest0: null, secureBootDigest1: null, secureBootSignerDigest: null },
      ]);
      const insert = `INSERT INTO "attractap_secure_boot_key" ("role", "publicKeyPem", "digest", "fingerprint") VALUES ('signing', 'p', 'd', 'f')`;
      await runner.query(insert);
      await expect(runner.query(insert)).rejects.toThrow(/UNIQUE/); // one row per digest

      await migration.down(runner);
      expect(await runner.query(`SELECT * FROM "attractap"`)).toEqual([{ id: 1, name: 'press' }]);
      const tables: Array<{ name: string }> = await runner.query(`SELECT name FROM sqlite_master WHERE type = 'table'`);
      expect(tables.map((t) => t.name)).not.toContain('attractap_secure_boot_key');
    } finally {
      await runner.release();
      await database.destroy();
    }
  }, 30_000);
});
