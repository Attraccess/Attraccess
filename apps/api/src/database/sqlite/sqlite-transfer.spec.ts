import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import type { MigrationTrack } from '../backend/database-backend';
import { SnapshotIncompatibleError, type DatabaseSnapshot } from '../transfer-snapshot';
import { columnKind, createSqliteTransfer, toInstantIso } from './sqlite-transfer';

const track: MigrationTrack = { name: 'test-track', tableName: 'migrations', directory: 'none', migrations: [] };
const transfer = createSqliteTransfer(track);

/**
 * A tiny schema with the shapes that matter for a transfer: an account whose balance a trigger maintains from its
 * entries (the account table sorts first, so a trigger left active would apply every entry on top of the copied
 * balance), generated keys, a generated column, binary data, big integers and exact text.
 */
async function createDatabase(): Promise<DataSource> {
  const source = await createTestDataSource();
  await source.query(
    'CREATE TABLE migrations (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, timestamp bigint NOT NULL, name varchar NOT NULL)',
  );
  await source.query("INSERT INTO migrations (timestamp, name) VALUES (1, 'First1'), (2, 'Second2')");
  await source.query(
    'CREATE TABLE a_account (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, balance integer NOT NULL DEFAULT 0)',
  );
  await source.query(`CREATE TABLE b_entry (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, accountId integer NOT NULL,
    amount integer NOT NULL, note text, doubled integer AS (amount * 2) STORED, bookedAt datetime,
    payload blob, active boolean NOT NULL DEFAULT 1, ratio float,
    FOREIGN KEY (accountId) REFERENCES a_account (id) ON DELETE CASCADE)`);
  await source.query(`CREATE TRIGGER b_entry_balance AFTER INSERT ON b_entry
    BEGIN UPDATE a_account SET balance = balance + NEW.amount WHERE id = NEW.accountId; END`);
  return source;
}

async function populate(source: DataSource): Promise<void> {
  await source.query('INSERT INTO a_account (id) VALUES (1), (5)');
  await source.query(
    `INSERT INTO b_entry (id, accountId, amount, note, bookedAt, payload, active, ratio) VALUES
      (1, 1, 9007199254740993, '007.50', '2026-01-02 03:04:05', x'00ff10', 1, 0.1),
      (2, 5, -40, NULL, '2026-01-02T05:04:05.250+02:00', NULL, 0, NULL)`,
  );
  await source.query('INSERT INTO b_entry (id, accountId, amount) VALUES (50, 5, 1)');
  await source.query('DELETE FROM b_entry WHERE id = 50');
}

describe('SQLite transfer', () => {
  const open: DataSource[] = [];
  const database = async () => {
    const source = await createDatabase();
    open.push(source);
    return source;
  };

  afterEach(async () => {
    await Promise.all(open.splice(0).map((source) => closeTestDataSource(source)));
  });

  describe('column kinds', () => {
    it.each([
      ['INTEGER', 'integer'],
      ['bigint', 'integer'],
      ['boolean', 'boolean'],
      ['datetime', 'timestamp'],
      ['TIMESTAMP', 'timestamp'],
      ['float', 'real'],
      ['BLOB', 'blob'],
      ['TEXT', 'text'],
      ['varchar(255)', 'text'],
      ['json', 'text'],
      ['', 'text'],
    ])('maps the declared type "%s" to %s', (declared, kind) => {
      expect(columnKind(declared)).toBe(kind);
    });
  });

  describe('instants', () => {
    it.each([
      ['2026-06-01 12:00:00', '2026-06-01T12:00:00.000Z'],
      ['2026-06-01 12:00:00.1', '2026-06-01T12:00:00.100Z'],
      ['2026-06-01 12:00:00.123', '2026-06-01T12:00:00.123Z'],
      ['2026-06-01T12:00:00.123Z', '2026-06-01T12:00:00.123Z'],
      ['2026-06-01T14:00:00+02:00', '2026-06-01T12:00:00.000Z'],
      ['2026-06-01 06:30:00-0530', '2026-06-01T12:00:00.000Z'],
      ['2026-06-01 12:00:00.123000', '2026-06-01T12:00:00.123Z'],
      ['2026-12-31 23:59:59.999', '2026-12-31T23:59:59.999Z'],
    ])('reads %s as %s', (stored, iso) => {
      expect(toInstantIso(stored, 'test')).toBe(iso);
    });

    it.each(['yesterday', '2026-13-45 99:99:99', '1717243200', ''])('refuses "%s" instead of guessing', (stored) => {
      expect(() => toInstantIso(stored, 'user.createdAt')).toThrow(SnapshotIncompatibleError);
    });

    it('refuses precision beyond milliseconds, which a snapshot cannot carry without loss', () => {
      expect(() => toInstantIso('2026-06-01 12:00:00.123456', 'x')).toThrow(/millisecond/);
    });
  });

  describe('export', () => {
    it('describes stored columns in neutral kinds and leaves out generated ones', async () => {
      const source = await database();
      await populate(source);
      const snapshot = await transfer.exportSnapshot(source);
      const entry = snapshot.tables.find((table) => table.name === 'b_entry');
      expect(entry?.columns).toEqual([
        { name: 'id', kind: 'integer' },
        { name: 'accountId', kind: 'integer' },
        { name: 'amount', kind: 'integer' },
        { name: 'note', kind: 'text' },
        { name: 'bookedAt', kind: 'timestamp' },
        { name: 'payload', kind: 'blob' },
        { name: 'active', kind: 'boolean' },
        { name: 'ratio', kind: 'real' },
      ]);
      expect(entry?.rows).toEqual([
        [1, 1, { integer: '9007199254740993' }, '007.50', '2026-01-02T03:04:05.000Z', { blob: 'AP8Q' }, true, 0.1],
        [2, 5, -40, null, '2026-01-02T03:04:05.250Z', null, false, null],
      ]);
      expect(snapshot.sequences).toMatchObject({ b_entry: 50, a_account: 5 });
      expect(snapshot.core).toEqual({
        track: 'test-track',
        migrations: [
          { timestamp: 1, name: 'First1' },
          { timestamp: 2, name: 'Second2' },
        ],
      });
    });

    it('is deterministic and independent of insertion order', async () => {
      const source = await database();
      await populate(source);
      expect(await transfer.exportSnapshot(source)).toEqual(await transfer.exportSnapshot(source));
    });

    it('refuses a value that is not what its column declares instead of exporting a guess', async () => {
      const source = await database();
      await source.query('INSERT INTO a_account (id) VALUES (1)');
      await source.query("INSERT INTO b_entry (id, accountId, amount, bookedAt) VALUES (1, 1, 1, 'last tuesday')");
      await expect(transfer.exportSnapshot(source)).rejects.toThrow(/b_entry\.bookedAt/);
    });
  });

  describe('import', () => {
    let snapshot: DatabaseSnapshot;
    let source: DataSource;
    let target: DataSource;

    beforeEach(async () => {
      source = await database();
      await populate(source);
      snapshot = await transfer.exportSnapshot(source);
      target = await database();
    });

    it('reproduces the data, including blobs, big integers, exact text and booleans', async () => {
      await transfer.importSnapshot(target, snapshot);
      expect(await transfer.exportSnapshot(target)).toEqual(snapshot);
      const [row] = await target.query(
        'SELECT CAST(amount AS TEXT) AS amount, note, hex(payload) AS payload FROM b_entry WHERE id = 1',
      );
      expect(row).toEqual({ amount: '9007199254740993', note: '007.50', payload: '00FF10' });
    });

    it('recomputes generated columns instead of copying them', async () => {
      await transfer.importSnapshot(target, snapshot);
      expect(await target.query('SELECT id, CAST(doubled AS TEXT) AS doubled FROM b_entry ORDER BY id')).toEqual([
        { id: 1, doubled: '18014398509481986' },
        { id: 2, doubled: '-80' },
      ]);
    });

    it('takes derived balances from the snapshot instead of applying the entries again', async () => {
      await transfer.importSnapshot(target, snapshot);
      expect(await target.query('SELECT id, CAST(balance AS TEXT) AS balance FROM a_account ORDER BY id')).toEqual([
        { id: 1, balance: '9007199254740993' },
        { id: 5, balance: '-39' },
      ]);
    });

    it('puts the maintenance trigger back, and the next generated id after the highest one issued', async () => {
      await transfer.importSnapshot(target, snapshot);
      await target.query('INSERT INTO b_entry (accountId, amount) VALUES (5, 100)');
      expect(await target.query('SELECT id FROM b_entry ORDER BY id DESC LIMIT 1')).toEqual([{ id: 51 }]);
      expect(await target.query('SELECT balance FROM a_account WHERE id = 5')).toEqual([{ balance: 61 }]);
    });

    it('replaces existing rows and keeps the foreign key setting of the connection', async () => {
      await target.query('INSERT INTO a_account (id, balance) VALUES (9, 123)');
      await target.query('PRAGMA foreign_keys = ON');
      await transfer.importSnapshot(target, snapshot);
      expect(await target.query('SELECT id FROM a_account ORDER BY id')).toEqual([{ id: 1 }, { id: 5 }]);
      expect(await target.query('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
    });

    it('rolls everything back, triggers included, when a reference in the snapshot is broken', async () => {
      await populate(target);
      const before = await transfer.exportSnapshot(target);
      const broken: DatabaseSnapshot = {
        ...snapshot,
        tables: snapshot.tables.map((table) =>
          table.name === 'b_entry'
            ? { ...table, rows: table.rows.map((row) => [row[0], 404, ...row.slice(2)]) }
            : table,
        ),
      };
      await expect(transfer.importSnapshot(target, broken)).rejects.toThrow(/foreign keys/);
      expect(await transfer.exportSnapshot(target)).toEqual(before);
      expect(await target.query("SELECT name FROM sqlite_master WHERE type = 'trigger'")).toEqual([
        { name: 'b_entry_balance' },
      ]);
    });

    it('refuses a database that has tables the snapshot does not describe, before writing anything', async () => {
      await target.query('CREATE TABLE stranger (id integer PRIMARY KEY)');
      await expect(transfer.importSnapshot(target, snapshot)).rejects.toThrow(/stranger/);
      expect(await target.query('SELECT COUNT(*) AS n FROM b_entry')).toEqual([{ n: 0 }]);
    });

    it('refuses a snapshot of another format', async () => {
      await expect(transfer.importSnapshot(target, { ...snapshot, format: 2 as 1 })).rejects.toThrow(/format/);
    });
  });
});
