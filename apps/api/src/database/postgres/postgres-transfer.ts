import type { DataSource, EntityManager } from 'typeorm';
import { versionsTableName } from '../../plugin-system/plugin-storage/storage-model';
import type { MigrationTrack } from '../backend/database-backend';
import { declaredColumns, declaredTables, fieldKind } from '../transfer-declared';
import {
  SnapshotIncompatibleError,
  type DatabaseSnapshot,
  type DatabaseTransfer,
  type ExportSnapshotOptions,
  type ImportSnapshotOptions,
  type MigrationRecord,
  type PluginSnapshot,
  type SnapshotValue,
  type TableSnapshot,
} from '../transfer-snapshot';
import {
  bindValue,
  exportValue,
  kindOfPgType,
  placeholder,
  selectExpression,
  type ColumnPlan,
} from './postgres-transfer-values';
import { describePostgresError, loadTableRows } from './postgres-transfer-load';

type Query = Pick<EntityManager, 'query'>;

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** Tables whose content belongs to a source engine's bookkeeping and never crosses engines. */
const ENGINE_BOOKKEEPING = new Set(['migrations', 'typeorm_metadata']);

export async function userTables(manager: Query): Promise<string[]> {
  const rows: { table_name: string }[] = await manager.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((row) => row.table_name);
}

/** Stored columns in table order. Generated columns are derived and never copied. */
async function storedColumns(manager: Query, table: string): Promise<{ name: string; type: string }[]> {
  const rows: { column_name: string; data_type: string }[] = await manager.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND is_generated = 'NEVER'
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((row) => ({ name: row.column_name, type: row.data_type }));
}

async function primaryKey(manager: Query, table: string): Promise<string[]> {
  const rows: { attname: string }[] = await manager.query(
    `SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indisprimary AND i.indrelid = to_regclass(quote_ident(current_schema()) || '.' || quote_ident($1))
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [table],
  );
  return rows.map((row) => row.attname);
}

async function columnPlans(
  manager: Query,
  table: string,
  declared: ReturnType<typeof declaredColumns>,
): Promise<ColumnPlan[]> {
  const fields = declared.get(table);
  const pgColumns: { name: string; type: string }[] = await storedColumns(manager, table);
  // The declared type of json columns: information_schema reports them as json/jsonb in data_type.
  return pgColumns.map((column) => {
    const field = fields?.get(column.name);
    const kind = field ? fieldKind(field) : kindOfPgType(column.type);
    return { name: column.name, kind, field, pgType: column.type };
  });
}

async function readMigrations(manager: Query, table: string): Promise<MigrationRecord[]> {
  const exists = await manager.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [table],
  );
  if (exists.length === 0) return [];
  const rows: { timestamp: string; name: string }[] = await manager.query(
    `SELECT "timestamp"::text AS timestamp, "name" FROM ${quote(table)} ORDER BY "id"`,
  );
  return rows.map((row) => ({ timestamp: Number(row.timestamp), name: row.name }));
}

/** The storage versions recorded for a plugin namespace, ascending; empty when the plugin never migrated here. */
export async function appliedStorageVersions(manager: Query, namespace: string): Promise<number[]> {
  const table = versionsTableName(namespace);
  const exists = await manager.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [table],
  );
  if (exists.length === 0) return [];
  const rows: { version: string }[] = await manager.query(
    `SELECT "version"::text AS version FROM ${quote(table)} ORDER BY "version"`,
  );
  return rows.map((row) => Number(row.version));
}

/** Sequences owned by table columns: (table, column, sequence). */
async function ownedSequences(manager: Query): Promise<{ table: string; column: string; sequence: string }[]> {
  return manager.query(
    `SELECT t.relname AS "table", a.attname AS "column", s.relname AS sequence
       FROM pg_class s
       JOIN pg_namespace n ON n.oid = s.relnamespace
       JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i') AND d.classid = 'pg_class'::regclass
       JOIN pg_class t ON t.oid = d.refobjid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relkind = 'S' AND n.nspname = current_schema() ORDER BY t.relname`,
  );
}

async function exportTable(
  source: Query,
  table: string,
  declared: ReturnType<typeof declaredColumns>,
): Promise<TableSnapshot> {
  const plans = await columnPlans(source, table, declared);
  const keys = await primaryKey(source, table);
  const selects = plans.map((plan, index) => `${selectExpression(plan.name, plan)} AS c${index}`);
  const order = keys.length > 0 ? keys.map(quote).join(', ') : plans.map((plan) => quote(plan.name)).join(', ');
  const rows: Record<string, unknown>[] =
    plans.length === 0 ? [] : await source.query(`SELECT ${selects.join(', ')} FROM ${quote(table)} ORDER BY ${order}`);
  return {
    name: table,
    columns: plans.map(({ name, kind }) => ({ name, kind })),
    rows: rows.map((row, rowIndex) =>
      plans.map((plan, index) => exportValue(plan, row[`c${index}`], `${table}[${rowIndex}].${plan.name}`)),
    ),
  };
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

async function assertPluginsRestorable(
  target: Query,
  snapshot: DatabaseSnapshot,
  options: ImportSnapshotOptions,
): Promise<void> {
  for (const plugin of snapshot.plugins) {
    const installed = options.plugins?.find((candidate) => candidate.id === plugin.id);
    if (!installed) {
      throw new SnapshotIncompatibleError(
        `Plugin ${plugin.id} is not installed in the target; install version ${plugin.version} first`,
      );
    }
    const versions = await appliedStorageVersions(target, installed.storage.namespace);
    if (
      installed.storage.namespace !== plugin.storage.namespace ||
      !sameNames(versions.map(String), plugin.storage.versions.map(String))
    ) {
      throw new SnapshotIncompatibleError(
        `The storage of plugin ${plugin.id} is at version ${versions.at(-1) ?? 'none'}, the snapshot at version ` +
          `${plugin.storage.versions.at(-1) ?? 'none'} (plugin version ${plugin.version}); install that plugin version first`,
      );
    }
  }
}

async function assertRestorable(
  target: Query,
  snapshot: DatabaseSnapshot,
  track: MigrationTrack,
  options: ImportSnapshotOptions,
): Promise<Map<string, ColumnPlan[]>> {
  if (snapshot.format !== 1) throw new SnapshotIncompatibleError(`Unsupported snapshot format ${snapshot.format}`);
  // A snapshot of another engine (the SQLite upgrade path) carries that engine's migration bookkeeping, which has no
  // meaning here: the target's own track state stays. A snapshot of this engine must match the target exactly.
  const foreign = snapshot.backend !== 'postgres';
  if (!foreign) {
    if (snapshot.core.track !== track.name) {
      throw new SnapshotIncompatibleError(
        `The snapshot was written by the "${snapshot.core.track}" migration track, this database uses "${track.name}"`,
      );
    }
    const core = await readMigrations(target, track.tableName);
    if (
      !sameNames(
        core.map((m) => m.name),
        snapshot.core.migrations.map((m) => m.name),
      )
    ) {
      throw new SnapshotIncompatibleError(
        'The core migration state of the database differs from the snapshot; restore with the matching application version',
      );
    }
  }
  await assertPluginsRestorable(target, snapshot, options);
  const existing = await userTables(target);
  const described = new Set(snapshot.tables.map((table) => table.name));
  if (!foreign) {
    const undescribed = existing.filter((name) => !described.has(name));
    if (undescribed.length > 0) {
      throw new SnapshotIncompatibleError(
        `The database has tables the snapshot does not describe: ${undescribed.join(', ')}`,
      );
    }
  }
  const declared = declaredColumns(options.plugins);
  const plans = new Map<string, ColumnPlan[]>();
  for (const table of snapshot.tables) {
    if (foreign && ENGINE_BOOKKEEPING.has(table.name)) continue;
    if (!existing.includes(table.name)) {
      throw new SnapshotIncompatibleError(
        `The database has no table ${table.name}${
          foreign ? ' (data of a plugin that is not installed, or a table of an older release)' : ''
        }`,
      );
    }
    const columns = await columnPlans(target, table.name, declared);
    if (!sameNames(columns.map((c) => c.name).sort(), table.columns.map((c) => c.name).sort())) {
      const known = new Set(columns.map((c) => c.name));
      const extra = table.columns.map((c) => c.name).filter((name) => !known.has(name));
      throw new SnapshotIncompatibleError(
        `The columns of table ${table.name} differ from the snapshot${extra.length ? ` (not in the target: ${extra.join(', ')})` : ''}`,
      );
    }
    plans.set(table.name, columns);
  }
  return plans;
}

interface ForeignKey {
  name: string;
  child: string;
  parent: string;
  childColumns: string[];
  parentColumns: string[];
  definition: string;
}

async function foreignKeys(manager: Query): Promise<ForeignKey[]> {
  const rows: Array<{
    name: string;
    child: string;
    parent: string;
    child_columns: string[];
    parent_columns: string[];
    definition: string;
  }> = await manager.query(
    `SELECT c.conname AS name, cl.relname AS child, pl.relname AS parent,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS child_columns,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parent_columns,
        pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pl ON pl.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE c.contype = 'f' AND n.nspname = current_schema() ORDER BY cl.relname, c.conname`,
  );
  return rows.map((row) => ({
    name: row.name,
    child: row.child,
    parent: row.parent,
    childColumns: row.child_columns,
    parentColumns: row.parent_columns,
    definition: row.definition,
  }));
}

/** The first rows that break a foreign key: the key columns of the child, never other columns of the row. */
async function orphans(manager: Query, key: ForeignKey): Promise<string> {
  const join = key.childColumns.map((c, i) => `p.${quote(key.parentColumns[i])} = c.${quote(c)}`).join(' AND ');
  const notNull = key.childColumns.map((c) => `c.${quote(c)} IS NOT NULL`).join(' AND ');
  const select = key.childColumns.map((c) => `c.${quote(c)}::text AS ${quote(c)}`).join(', ');
  const rows = await manager.query(
    `SELECT ${select} FROM ${quote(key.child)} c WHERE ${notNull}
       AND NOT EXISTS (SELECT 1 FROM ${quote(key.parent)} p WHERE ${join}) LIMIT 5`,
  );
  return JSON.stringify(rows);
}

async function userTriggerTables(manager: Query): Promise<string[]> {
  const rows: { relname: string }[] = await manager.query(
    `SELECT DISTINCT cl.relname FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = current_schema() ORDER BY cl.relname`,
  );
  return rows.map((row) => row.relname);
}

async function resetSequences(manager: Query, snapshot: DatabaseSnapshot): Promise<void> {
  for (const { table, column, sequence } of await ownedSequences(manager)) {
    // Migration bookkeeping stays as it is: its ids belong to this database's own track.
    if (ENGINE_BOOKKEEPING.has(table)) continue;
    const issued = snapshot.sequences[table] ?? 0;
    const [{ top }]: { top: string }[] = await manager.query(
      `SELECT COALESCE(MAX(${quote(column)}), 0)::text AS top FROM ${quote(table)}`,
    );
    // Generated keys continue after the highest id the source ever issued, also after deletes.
    const last = Math.max(issued, Number(top));
    if (last > 0) await manager.query('SELECT setval($1::regclass, $2, true)', [quote(sequence), last]);
    else await manager.query('SELECT setval($1::regclass, 1, false)', [quote(sequence)]);
  }
}

/**
 * The PostgreSQL transfer. Restoring replaces every table inside one transaction: foreign keys are dropped while rows
 * are copied and re-added (and so verified) before commit, the triggers that maintain derived data (balances, usage
 * integrity) are disabled and re-enabled, so derived values are taken from the snapshot instead of being applied a
 * second time. It either succeeds fully or changes nothing.
 */
export function createPostgresTransfer(track: MigrationTrack): DatabaseTransfer<DataSource> {
  return {
    async exportSnapshot(source: DataSource, options: ExportSnapshotOptions = {}): Promise<DatabaseSnapshot> {
      const declared = declaredColumns(options.plugins);
      const tables: TableSnapshot[] = [];
      for (const name of await userTables(source)) tables.push(await exportTable(source, name, declared));
      const present = new Set(tables.map((table) => table.name));
      const plugins: PluginSnapshot[] = [];
      for (const plugin of options.plugins ?? []) {
        const pluginTables = declaredTables(plugin);
        const missing = pluginTables.filter((name) => !present.has(name));
        if (missing.length > 0) {
          throw new SnapshotIncompatibleError(
            `Plugin ${plugin.id} declares tables that do not exist: ${missing.join(', ')}`,
          );
        }
        const { namespace } = plugin.storage;
        plugins.push({
          id: plugin.id,
          version: plugin.version,
          tables: pluginTables,
          storage: { namespace, versions: await appliedStorageVersions(source, namespace) },
        });
      }
      const sequences: Record<string, number> = {};
      for (const { table, sequence } of await ownedSequences(source)) {
        const [state]: { last_value: string; is_called: boolean }[] = await source.query(
          `SELECT last_value::text AS last_value, is_called FROM ${quote(sequence)}`,
        );
        sequences[table] = state.is_called ? Number(state.last_value) : 0;
      }
      return {
        format: 1,
        backend: 'postgres',
        core: { track: track.name, migrations: await readMigrations(source, track.tableName) },
        plugins,
        tables,
        sequences,
      };
    },

    async importSnapshot(
      target: DataSource,
      snapshot: DatabaseSnapshot,
      options: ImportSnapshotOptions = {},
    ): Promise<void> {
      const plans = await assertRestorable(target, snapshot, track, options);
      await target.transaction(async (manager) => {
        await manager.query('SET LOCAL lock_timeout = 0');
        const keys = await foreignKeys(manager);
        for (const key of keys)
          await manager.query(`ALTER TABLE ${quote(key.child)} DROP CONSTRAINT ${quote(key.name)}`);
        const triggered = await userTriggerTables(manager);
        for (const table of triggered) await manager.query(`ALTER TABLE ${quote(table)} DISABLE TRIGGER USER`);
        // The migration bookkeeping stays as it is: assertRestorable verified a snapshot of this engine carries the
        // same migration state, and a snapshot of another engine carries that engine's, which has no meaning here.
        const loaded = snapshot.tables.filter((table) => plans.has(table.name) && !ENGINE_BOOKKEEPING.has(table.name));
        const wipe = (await userTables(manager)).filter((name) => !ENGINE_BOOKKEEPING.has(name));
        if (wipe.length > 0) await manager.query(`TRUNCATE ${wipe.map(quote).join(', ')} RESTART IDENTITY`);
        for (const table of loaded) {
          const tablePlans = plans.get(table.name) as ColumnPlan[];
          await loadTableRows(manager, table, tablePlans, {
            bind: (plan, value: SnapshotValue, where) => bindValue(plan, value, where),
            placeholder,
          });
        }
        for (const key of keys) {
          try {
            await manager.query('SAVEPOINT restore_fk');
            await manager.query(`ALTER TABLE ${quote(key.child)} ADD CONSTRAINT ${quote(key.name)} ${key.definition}`);
            await manager.query('RELEASE SAVEPOINT restore_fk');
          } catch (error) {
            await manager.query('ROLLBACK TO SAVEPOINT restore_fk');
            throw new SnapshotIncompatibleError(
              `The snapshot breaks the foreign key ${key.name} of table ${key.child} (references ${key.parent}): ` +
                `${describePostgresError(error)}; offending keys ${await orphans(manager, key)}`,
            );
          }
        }
        // Last, before the commit: sequence changes are not rolled back, so a failed import must not have made any.
        await resetSequences(manager, snapshot);
        for (const table of triggered) await manager.query(`ALTER TABLE ${quote(table)} ENABLE TRIGGER USER`);
      });
    },
  };
}

/** Derived data that must agree with its source: every user's balance equals their completed transactions. */
export async function postgresIntegrityViolations(manager: Query): Promise<string[]> {
  const problems: string[] = [];
  const drift: { id: number; balance: string; expected: string }[] = await manager.query(
    `SELECT u.id, u."creditBalance"::text AS balance, COALESCE(SUM(t.amount), 0)::text AS expected
       FROM "user" u LEFT JOIN billing_transaction t ON t."userId" = u.id AND t.status = 'completed'
      GROUP BY u.id HAVING u."creditBalance" <> COALESCE(SUM(t.amount), 0)`,
  );
  for (const row of drift) {
    problems.push(`balance of user ${row.id} is ${row.balance}, completed transactions say ${row.expected}`);
  }
  return problems;
}
