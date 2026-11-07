import { DataSource } from 'typeorm';
import { NfcCardPendingChange1792450000000 } from './1792450000000-nfc-card-pending-change';

describe('NfcCardPendingChange migration', () => {
  it('creates the pending card change table with its UID index and can be reverted', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      const migration = new NfcCardPendingChange1792450000000();
      await migration.up(runner);

      // An enrollment recovery record: the new key is stored encrypted, the card id is not known yet.
      await runner.query(
        `INSERT INTO "nfc_card_pending_change" ("uid", "kind", "userId", "keyNo", "key", "actorId")
         VALUES ('04aabbccddee80', 'enroll', 5, 1, 'encrypted-key', 2)`,
      );
      // A reset recovery record carries no key.
      await runner.query(
        `INSERT INTO "nfc_card_pending_change" ("uid", "kind", "cardId", "keyNo") VALUES ('04aabbccddee80', 'reset', 3, 1)`,
      );
      const rows = await runner.query(
        `SELECT * FROM "nfc_card_pending_change" WHERE "uid" = '04aabbccddee80' ORDER BY "id"`,
      );
      expect(rows).toEqual([
        expect.objectContaining({
          id: 1,
          kind: 'enroll',
          userId: 5,
          cardId: null,
          keyNo: 1,
          key: 'encrypted-key',
          actorId: 2,
        }),
        expect.objectContaining({ id: 2, kind: 'reset', userId: null, cardId: 3, keyNo: 1, key: null, actorId: null }),
      ]);
      expect(rows[0].createdAt).toEqual(expect.any(String));
      await expect(
        runner.query(`INSERT INTO "nfc_card_pending_change" ("kind", "keyNo") VALUES ('enroll', 1)`),
      ).rejects.toThrow(/NOT NULL/);
      expect(await runner.query(`PRAGMA index_list("nfc_card_pending_change")`)).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'IDX_nfc_card_pending_change_uid' })]),
      );

      await migration.down(runner);
      expect(await runner.query(`SELECT name FROM sqlite_master WHERE name LIKE '%nfc_card_pending_change%'`)).toEqual(
        [],
      );
    } finally {
      await runner.release();
      await database.destroy();
    }
  });

  it('keeps an existing table and its rows when the migration ran before under an earlier name', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      const migration = new NfcCardPendingChange1792450000000();
      await migration.up(runner);
      await runner.query(
        `INSERT INTO "nfc_card_pending_change" ("uid", "kind", "cardId", "keyNo") VALUES ('04aabbccddee80', 'reset', 3, 1)`,
      );
      // The earlier run left the table without its index.
      await runner.query('DROP INDEX "IDX_nfc_card_pending_change_uid"');

      await migration.up(runner);

      expect(await runner.query(`SELECT "uid", "kind" FROM "nfc_card_pending_change"`)).toEqual([
        { uid: '04aabbccddee80', kind: 'reset' },
      ]);
      expect(await runner.query(`PRAGMA index_list("nfc_card_pending_change")`)).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'IDX_nfc_card_pending_change_uid' })]),
      );

      await migration.down(runner);
      await migration.down(runner); // nothing left to drop
      expect(await runner.query(`SELECT name FROM sqlite_master WHERE name LIKE '%nfc_card_pending_change%'`)).toEqual(
        [],
      );
    } finally {
      await runner.release();
      await database.destroy();
    }
  });
});
