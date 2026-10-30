import { DataSource } from 'typeorm';
import { AttractapPairing1791600000000 } from './1791600000000-attractap-pairing';

describe('AttractapPairing migration', () => {
  it('keeps existing readers unpaired and keeps the credential history and identity on rollback', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(
        `CREATE TABLE "attractap" (id integer PRIMARY KEY, name text NOT NULL, apiTokenHash text NOT NULL)`,
      );
      await runner.query(`INSERT INTO "attractap" (id, name, apiTokenHash) VALUES (1, 'press', 'hash')`);

      const migration = new AttractapPairing1791600000000();
      await migration.up(runner);
      await migration.up(runner); // re-applying after a rollback must not fail

      const [reader] = await runner.query(`SELECT * FROM "attractap"`);
      expect(reader).toMatchObject({
        id: 1,
        apiTokenHash: 'hash',
        pairingState: 'unpaired',
        credentialFingerprint: null,
      });

      await runner.query(
        `INSERT INTO "attractap_credential_event" ("readerId", "readerName", "keyFingerprint", "state") VALUES (1, 'press', 'ab', 'paired')`,
      );
      await runner.query(
        `INSERT INTO "attractap_installation" ("id", "installationId", "caCertificatePem", "caPrivateKeyEncrypted", "serverCertificatePem", "serverPrivateKeyEncrypted", "serverCertificateNotAfter") VALUES (1, 'i', 'c', 'k', 's', 'k', datetime('now'))`,
      );
      // The history has no foreign key: it survives deleting the reader.
      await runner.query(`DELETE FROM "attractap" WHERE id = 1`);
      expect(await runner.query(`SELECT * FROM "attractap_credential_event"`)).toHaveLength(1);

      await migration.down(runner);
      expect(await runner.query(`SELECT "readerName", "state" FROM "attractap_credential_event"`)).toEqual([
        { readerName: 'press', state: 'paired' },
      ]);
      expect(await runner.query(`SELECT "installationId" FROM "attractap_installation"`)).toEqual([
        { installationId: 'i' },
      ]);
      const columns: Array<{ name: string }> = await runner.query(`PRAGMA table_info("attractap")`);
      expect(columns.map((c) => c.name)).not.toContain('pairingState');
    } finally {
      await runner.release();
      await database.destroy();
    }
  }, 30_000);
});
