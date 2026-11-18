import type { DataSource } from 'typeorm';
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import {
  SnapshotIncompatibleError,
  type DatabaseSnapshot,
  type PluginDescriptor,
  type TableSnapshot,
} from '../transfer-snapshot';
import { postgresBackend } from './postgres-backend';

jest.setTimeout(120_000);

const entry = table({
  id: f.id(),
  at: f.timestamp(),
  on: f.boolean(),
  price: f.decimal(10, 2),
  day: f.date().optional(),
  note: f.text().optional(),
});
const STORAGE = definePluginStorage({
  tables: { entry },
  migrations: [{ version: 1, name: 'entries', steps: [step.createTable('entry', entry)] }],
});
const storage = compilePluginStorage('ledger', STORAGE, { reservedTables: postgresBackend.plugins.coreTableNames() });
const PLUGIN: PluginDescriptor = { id: 'ledger', version: '2.1.0', storage };
const ENTRY_TABLE = 'plugin_ledger_entry';

const transfer = postgresBackend.transfer;
const urlOf = (source: DataSource): string => (source.options as { url: string }).url;
const withPlugin = async (source: DataSource): Promise<void> => {
  await postgresBackend.plugins
    .createMigrationEngine({ type: 'postgres', url: urlOf(source) } as never)
    .migrate(storage);
};
const tableOf = (snapshot: DatabaseSnapshot, name: string): TableSnapshot =>
  snapshot.tables.find((candidate) => candidate.name === name) as TableSnapshot;
const column = (snapshot: DatabaseSnapshot, name: string, columnName: string): number =>
  tableOf(snapshot, name).columns.findIndex((candidate) => candidate.name === columnName);
const clone = (snapshot: DatabaseSnapshot): DatabaseSnapshot => JSON.parse(JSON.stringify(snapshot));
const replaceTable = (snapshot: DatabaseSnapshot, name: string, rows: TableSnapshot['rows']): DatabaseSnapshot => ({
  ...snapshot,
  tables: snapshot.tables.map((candidate) => (candidate.name === name ? { ...candidate, rows } : candidate)),
});

describe('postgres transfer (persistence)', () => {
  let source: DataSource;
  let target: DataSource;
  let snapshot: DatabaseSnapshot;
  let issuedSetting: number;

  beforeAll(async () => {
    source = await createTestDataSource();
    target = await createTestDataSource();
    await withPlugin(source);
    await withPlugin(target);
    await source.query(
      `INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com'), (2, 'bob', 'bob@example.com')`,
    );
    await source.query(`INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`);
    await source.query(
      `INSERT INTO resource_usage (id, "resourceId", "userId", "startTime", "usageAction", "isFinalized")
       VALUES (1, 1, 1, '2026-03-29T01:00:00Z', 'usage', true)`,
    );
    await source.query(
      `INSERT INTO "${ENTRY_TABLE}" (at, "on", price, day, note) VALUES
        ('2026-03-02T09:00:00.500Z', true, 12.5, '2026-03-02', 'first'), ('2026-03-03T09:00:00Z', false, 0, NULL, NULL)`,
    );
    // A deleted highest id must not be reused by the restored database.
    const [{ id }] = await source.query(
      `INSERT INTO setting (parent, key, value) VALUES ('x', 'gone', 'y') RETURNING id`,
    );
    await source.query(`DELETE FROM setting WHERE id = $1`, [id]);
    issuedSetting = id;
    snapshot = await transfer.exportSnapshot(source, { plugins: [PLUGIN] });
  });

  afterAll(async () => {
    await closeTestDataSource(source);
    await closeTestDataSource(target);
  });

  const usernames = async (db: DataSource): Promise<string[]> =>
    (await db.query(`SELECT username FROM "user" ORDER BY id`)).map((row: { username: string }) => row.username);

  describe('exportSnapshot', () => {
    it('describes the tables, the plugin storage state, the track and the sequences', () => {
      expect(snapshot.format).toBe(1);
      expect(snapshot.backend).toBe('postgres');
      expect(snapshot.core.track).toBe('postgres');
      expect(snapshot.plugins).toEqual([
        { id: 'ledger', version: '2.1.0', tables: [ENTRY_TABLE], storage: { namespace: 'ledger', versions: [1] } },
      ]);
      expect(tableOf(snapshot, 'user').rows).toHaveLength(2);
      expect(snapshot.sequences.setting).toBe(issuedSetting);
      const [firstEntry] = tableOf(snapshot, ENTRY_TABLE).rows;
      const columns = tableOf(snapshot, ENTRY_TABLE).columns.map((c) => c.name);
      expect(firstEntry[columns.indexOf('at')]).toBe('2026-03-02T09:00:00.500Z');
      expect(firstEntry[columns.indexOf('price')]).toBe('12.50');
      expect(firstEntry[columns.indexOf('day')]).toBe('2026-03-02');
    });

    it('exports without plugins', async () => {
      expect((await transfer.exportSnapshot(source)).plugins).toEqual([]);
    });

    it('refuses a plugin whose declared tables do not exist', async () => {
      const bare = await createTestDataSource();
      try {
        await expect(transfer.exportSnapshot(bare, { plugins: [PLUGIN] })).rejects.toThrow(
          `Plugin ledger declares tables that do not exist: ${ENTRY_TABLE}`,
        );
      } finally {
        await closeTestDataSource(bare);
      }
    });
  });

  describe('importSnapshot', () => {
    it('restores every row and sequence, so that exporting the target gives the same snapshot', async () => {
      await transfer.importSnapshot(target, snapshot, { plugins: [PLUGIN] });

      const restored = await transfer.exportSnapshot(target, { plugins: [PLUGIN] });
      expect({ ...restored, sequences: undefined }).toEqual({ ...snapshot, sequences: undefined });
      // Sequences continue after the highest id present, or the highest the source issued.
      expect(restored.sequences.user).toBe(2);
      expect(restored.sequences.setting).toBeGreaterThanOrEqual(snapshot.sequences.setting);
      // The next generated key continues after the highest id the source ever issued.
      const [{ id }] = await target.query(
        `INSERT INTO setting (parent, key, value) VALUES ('x', 'next', 'y') RETURNING id`,
      );
      expect(id).toBeGreaterThan(issuedSetting);
      await target.query(`DELETE FROM setting WHERE id = $1`, [id]);
    });

    it('replaces what the target held, and is repeatable', async () => {
      await target.query(`INSERT INTO "user" (id, username, email) VALUES (77, 'stale', 'stale@example.com')`);
      await transfer.importSnapshot(target, snapshot, { plugins: [PLUGIN] });
      expect(await usernames(target)).toEqual(['ada', 'bob']);
    });

    it('accepts a snapshot without any row (sequences are reset)', async () => {
      const empty = await createTestDataSource();
      try {
        const emptySnapshot = await transfer.exportSnapshot(empty);
        await transfer.importSnapshot(empty, emptySnapshot);
        expect((await transfer.exportSnapshot(empty)).tables).toEqual(emptySnapshot.tables);
      } finally {
        await closeTestDataSource(empty);
      }
    });

    describe('refusals, which change nothing', () => {
      const refuses = async (bad: DatabaseSnapshot, message: RegExp | string, plugins = [PLUGIN]) => {
        await transfer.importSnapshot(target, snapshot, { plugins: [PLUGIN] });
        const error = await transfer.importSnapshot(target, bad, { plugins }).catch((e) => e);
        expect(error).toBeInstanceOf(SnapshotIncompatibleError);
        expect(error.message).toMatch(message);
        expect(await usernames(target)).toEqual(['ada', 'bob']);
        return error as Error;
      };

      it('an unknown snapshot format', async () => {
        await refuses({ ...snapshot, format: 2 } as never, 'Unsupported snapshot format 2');
      });

      it('a snapshot of another migration track', async () => {
        await refuses(
          { ...snapshot, core: { ...snapshot.core, track: 'frozen' } },
          'written by the "frozen" migration track, this database uses "postgres"',
        );
      });

      it('a snapshot of another core migration state', async () => {
        await refuses(
          { ...snapshot, core: { ...snapshot.core, migrations: [{ timestamp: 1, name: 'Other1' }] } },
          'core migration state of the database differs',
        );
      });

      it('a database with tables the snapshot does not describe', async () => {
        await refuses(
          { ...snapshot, tables: snapshot.tables.filter((t) => t.name !== 'resource_usage_recovery') },
          'tables the snapshot does not describe: resource_usage_recovery',
        );
      });

      it('a snapshot table the database does not have', async () => {
        await refuses(
          { ...snapshot, tables: [...snapshot.tables, { name: 'ghost', columns: [], rows: [] }] },
          'The database has no table ghost',
        );
      });

      it('a snapshot whose table has other columns', async () => {
        const changed = clone(snapshot);
        tableOf(changed, 'setting').columns = [...tableOf(changed, 'setting').columns, { name: 'extra', kind: 'text' }];
        await refuses(changed, /columns of table setting differ.*not in the target: extra/);
        const without = clone(snapshot);
        tableOf(without, 'setting').columns = tableOf(without, 'setting').columns.slice(1);
        await refuses(without, /columns of table setting differ/);
      });

      it('a plugin that is not installed in the target', async () => {
        await refuses(snapshot, 'Plugin ledger is not installed in the target; install version 2.1.0 first', []);
      });

      it('a plugin whose storage is at another version', async () => {
        const changed = clone(snapshot);
        changed.plugins = [{ ...changed.plugins[0], storage: { namespace: 'ledger', versions: [1, 2] } }];
        await refuses(changed, 'storage of plugin ledger is at version 1, the snapshot at version 2');
      });

      it('a plugin whose storage namespace differs, or that never migrated in the target', async () => {
        const changed = clone(snapshot);
        changed.plugins = [{ ...changed.plugins[0], storage: { namespace: 'other', versions: [] } }];
        await refuses(changed, 'at version 1, the snapshot at version none');
        const bare = await createTestDataSource();
        try {
          await expect(transfer.importSnapshot(bare, snapshot, { plugins: [PLUGIN] })).rejects.toThrow(
            'storage of plugin ledger is at version none, the snapshot at version 1',
          );
        } finally {
          await closeTestDataSource(bare);
        }
      });

      it('a foreign snapshot without the plugin table, with an explanation', async () => {
        const foreign: DatabaseSnapshot = {
          ...snapshot,
          backend: 'sqlite',
          plugins: [],
          tables: [
            ...snapshot.tables.filter((t) => t.name !== ENTRY_TABLE),
            { name: 'plugin_gone', columns: [], rows: [] },
          ],
        };
        await refuses(foreign, 'data of a plugin that is not installed, or a table of an older release');
      });

      it('a row that breaks a unique constraint: names table, row and constraint, never the data', async () => {
        const duplicate = clone(snapshot);
        const username = column(duplicate, 'user', 'username');
        tableOf(duplicate, 'user').rows = tableOf(duplicate, 'user').rows.map((row) => {
          const copy = [...row];
          copy[username] = 'same-name-everywhere';
          return copy;
        });
        const error = await refuses(
          duplicate,
          /^Table user, row 2 \(id 2\) cannot be imported: SQLSTATE 23505, constraint \S+$/,
        );
        expect(error.message).not.toContain('same-name-everywhere');
      });

      it('a row of the wrong type for its column', async () => {
        const bad = clone(snapshot);
        tableOf(bad, ENTRY_TABLE).rows = tableOf(bad, ENTRY_TABLE).rows.map((row) =>
          row.map((v) => (v === '12.50' ? 'abc' : v)),
        );
        await refuses(bad, /price/);
      });

      it('rows that break a foreign key: names the key and the offending key values only', async () => {
        const orphaned = replaceTable(snapshot, 'resource', []);
        const error = await refuses(
          orphaned,
          /breaks the foreign key \S+ of table resource_usage \(references resource\)/,
        );
        expect(error.message).toMatch(/offending keys \[\{.*"1".*\}\]/);
        expect(error.message).not.toContain('Laser');
      });
    });
  });
});
