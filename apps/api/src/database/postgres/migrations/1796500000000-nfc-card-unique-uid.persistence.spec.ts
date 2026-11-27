import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { postgresMigrations } from './index';
import { NfcCardUniqueUid1796500000000 } from './1796500000000-nfc-card-unique-uid';

jest.setTimeout(120_000);

type CardRow = { id: number; uid: string; isActive?: boolean; createdAt?: string; userId?: number; type?: string };

describe('NfcCardUniqueUid1796500000000 (persistence)', () => {
  let source: DataSource;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: postgresMigrations, migrationsRun: true });
    await source.query(
      `INSERT INTO "user" (id, username, email) VALUES (1, 'alice', 'alice@example.test'), (2, 'bob', 'bob@example.test')`,
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await run('down');
  });
  afterEach(async () => {
    warn.mockRestore();
    await closeTestDataSource(source);
  });

  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await new NfcCardUniqueUid1796500000000()[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const insertCards = async (rows: CardRow[]) => {
    for (const row of rows) {
      await source.query(
        `INSERT INTO "nfc_card" (id, uid, "keyNo", key, "userId", "isActive", "createdAt", type)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7)`,
        [
          row.id,
          row.uid,
          `key-${row.id}`,
          row.userId ?? 1,
          row.isActive ?? false,
          row.createdAt ?? '2026-01-01T00:00:00Z',
          row.type ?? 'aes',
        ],
      );
    }
  };
  const ids = async (): Promise<number[]> =>
    (await source.query(`SELECT id FROM "nfc_card" ORDER BY id`)).map((row: { id: number }) => row.id);
  const snapshot = async () =>
    source.query(`SELECT id, uid, "keyNo", key, type, "isActive", "userId" FROM "nfc_card" ORDER BY id`);
  const insertCard = (uid: string) =>
    source.query(`INSERT INTO "nfc_card" (uid, "keyNo", key, "userId") VALUES ($1, 1, 'k', 1)`, [uid]);

  it('keeps the active record of a UID over a newer inactive one in another letter case', async () => {
    await insertCards([
      { id: 1, uid: '04AABB', isActive: false, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, uid: '04aabb', isActive: true, createdAt: '2026-01-02T00:00:00Z' },
      { id: 3, uid: '04CCDD', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: 4, uid: '04ccdd', isActive: false, createdAt: '2026-02-01T00:00:00Z' },
    ]);

    await run('up');

    expect(await ids()).toEqual([2, 3]);
  });

  it('keeps the newest record among inactive duplicates, then the highest id', async () => {
    await insertCards([
      { id: 1, uid: '0a0a', createdAt: '2026-03-01T00:00:00Z' },
      { id: 2, uid: '0A0A', createdAt: '2026-01-01T00:00:00Z' },
      { id: 3, uid: '0b0b', createdAt: '2026-01-01T00:00:00Z' },
      { id: 4, uid: '0B0B', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    await run('up');

    expect(await ids()).toEqual([1, 4]);
  });

  it('keeps the newest record among active duplicates of different users, then the highest id', async () => {
    await insertCards([
      { id: 1, uid: '0c0c', isActive: true, userId: 1, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, uid: '0C0C', isActive: true, userId: 2, createdAt: '2026-05-01T00:00:00Z' },
      { id: 3, uid: '0d0d', isActive: true, userId: 2, createdAt: '2026-01-01T00:00:00Z' },
      { id: 4, uid: '0D0D', isActive: true, userId: 1, createdAt: '2026-01-01T00:00:00Z' },
    ]);

    await run('up');

    expect(await ids()).toEqual([2, 4]);
  });

  it('leaves one record of a larger group and does not touch cards with other UIDs', async () => {
    await insertCards([
      { id: 1, uid: '0e0e' },
      { id: 2, uid: '0E0E', createdAt: '2026-02-01T00:00:00Z' },
      { id: 3, uid: '0e0E' },
      { id: 4, uid: '0E0e', createdAt: '2026-01-15T00:00:00Z' },
      { id: 5, uid: '1f1f', isActive: true, userId: 2 },
      { id: 6, uid: '2a2a', type: 'uid-only' },
    ]);
    const untouched = (await snapshot()).filter((row: CardRow) => row.id >= 5);

    await run('up');

    expect(await ids()).toEqual([2, 5, 6]);
    expect((await snapshot()).filter((row: CardRow) => row.id >= 5)).toEqual(untouched);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('Deleted 3 duplicate card(s)');
    expect(message).toContain('ids 1, 3, 4');
    expect(message).toContain('2 (deleted 1, 3, 4)');
    expect(message).not.toMatch(/key-/);
  });

  it('removes the pending resets of deleted cards and keeps the other pending changes', async () => {
    await insertCards([
      { id: 1, uid: '3b3b', isActive: true },
      { id: 2, uid: '3B3B' },
    ]);
    await source.query(
      `INSERT INTO "nfc_card_pending_change" (id, uid, kind, "userId", "cardId", "keyNo", key) VALUES
         (10, '3b3b', 'reset', NULL, 2, 1, NULL),
         (11, '3b3b', 'reset', NULL, 1, 1, NULL),
         (12, '3b3b', 'enroll', 1, NULL, 2, 'enc'),
         (13, '4c4c', 'enroll', 1, NULL, 3, 'enc')`,
    );

    await run('up');

    expect(await ids()).toEqual([1]);
    expect(
      (await source.query(`SELECT id FROM "nfc_card_pending_change" ORDER BY id`)).map((row: { id: number }) => row.id),
    ).toEqual([11, 12, 13]);
  });

  it('changes nothing on a database without duplicates', async () => {
    await insertCards([
      { id: 1, uid: '5d5d', isActive: true },
      { id: 2, uid: '6e6e' },
      { id: 3, uid: '7F7F', type: 'uid-only', userId: 2 },
    ]);
    const before = await snapshot();

    await run('up');

    expect(await snapshot()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses a second record of a UID in any letter case until down drops the index', async () => {
    await run('up');
    await insertCard('04aabb');

    await expect(insertCard('04AABB')).rejects.toMatchObject({
      driverError: expect.objectContaining({ code: '23505', constraint: 'UQ_nfc_card_uid_lower' }),
    });

    await run('down');
    await insertCard('04AABB');
    expect(await source.query(`SELECT uid FROM "nfc_card" ORDER BY id`)).toEqual([
      { uid: '04aabb' },
      { uid: '04AABB' },
    ]);
  });
});
