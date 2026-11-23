import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { postgresMigrations } from './index';
import { NfcCardType1796300000000 } from './1796300000000-nfc-card-type';

jest.setTimeout(120_000);

describe('NfcCardType1796300000000 (persistence)', () => {
  let source: DataSource;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: postgresMigrations, migrationsRun: true });
    await source.query(`INSERT INTO "user" (id, username, email) VALUES (1, 'alice', 'alice@example.test')`);
  });
  afterEach(() => closeTestDataSource(source));

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await new NfcCardType1796300000000()[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const columns = async () =>
    source.query(
      `SELECT column_name AS name, is_nullable AS nullable, column_default AS "default" FROM information_schema.columns
       WHERE table_name = 'nfc_card' AND column_name IN ('type', 'key', 'keyNo') ORDER BY column_name`,
    );

  it('makes a card without a type a secure (aes) card', async () => {
    await source.query(`INSERT INTO "nfc_card" (uid, "keyNo", key, "userId") VALUES ('04aa', 1, 'secret', 1)`);
    expect(await source.query(`SELECT type FROM "nfc_card"`)).toEqual([{ type: 'aes' }]);
  });

  it('upgrades existing cards to aes and keeps their keys', async () => {
    await run('down');
    await source.query(`INSERT INTO "nfc_card" (uid, "keyNo", key, "userId") VALUES ('04aa', 2, 'secret', 1)`);
    await run('up');
    expect(await source.query(`SELECT uid, type, "keyNo", key FROM "nfc_card"`)).toEqual([
      { uid: '04aa', type: 'aes', keyNo: 2, key: 'secret' },
    ]);
  });

  it('stores a UID-only card without key and key slot', async () => {
    await source.query(
      `INSERT INTO "nfc_card" (uid, type, "keyNo", key, "userId") VALUES ('1a2b', 'uid-only', NULL, NULL, 1)`,
    );
    expect(await source.query(`SELECT type, "keyNo", key FROM "nfc_card"`)).toEqual([
      { type: 'uid-only', keyNo: null, key: null },
    ]);
  });

  it('reverts: UID-only cards go, secure cards stay, the key is required again', async () => {
    await source.query(`INSERT INTO "nfc_card" (uid, "keyNo", key, "userId") VALUES ('04aa', 1, 'secret', 1)`);
    await source.query(
      `INSERT INTO "nfc_card" (uid, type, "keyNo", key, "userId") VALUES ('1a2b', 'uid-only', NULL, NULL, 1)`,
    );

    await run('down');

    expect(await source.query(`SELECT uid FROM "nfc_card"`)).toEqual([{ uid: '04aa' }]);
    expect((await columns()).map((column: { name: string }) => column.name)).toEqual(['key', 'keyNo']);
    await expect(
      source.query(`INSERT INTO "nfc_card" (uid, "keyNo", key, "userId") VALUES ('x', NULL, NULL, 1)`),
    ).rejects.toThrow(/null value/);
    await run('up');
  });
});
