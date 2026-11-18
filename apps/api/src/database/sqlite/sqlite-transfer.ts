import type { DataSource, EntityManager } from 'typeorm';
import type { CompiledField } from '../../plugin-system/plugin-storage/storage-model';
import type { MigrationTrack } from '../backend/database-backend';
import {
  SnapshotIncompatibleError,
  type DatabaseSnapshot,
  type DatabaseTransfer,
  type ExportSnapshotOptions,
  type ImportSnapshotOptions,
  type MigrationRecord,
  type PluginSnapshot,
  type SnapshotColumn,
  type SnapshotColumnKind,
  type SnapshotValue,
  type TableSnapshot,
} from '../transfer-snapshot';
import {
  appliedStorageVersions,
  bindDeclaredValue,
  declaredColumns,
  declaredTables,
  exportDeclaredValue,
  fieldKind,
  type DeclaredColumns,
} from './sqlite-transfer-plugins';

interface ColumnInfo {
  name: string;
  type: string;
  pk: number;
  hidden: number;
}

/** A column of a snapshot table with the plugin field that types it, if a plugin declared the table. */
interface ColumnPlan extends SnapshotColumn {
  readonly field?: CompiledField;
}

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** Declared SQLite types are free text; the kind is what the value means to the application. */
export function columnKind(declaredType: string): SnapshotColumnKind {
  const type = declaredType.toUpperCase();
  if (type.includes('BLOB')) return 'blob';
  if (type.includes('BOOL')) return 'boolean';
  if (type.includes('INT')) return 'integer';
  if (type.includes('DATE') || type.includes('TIME')) return 'timestamp';
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'real';
  return 'text';
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * SQLite stores instants as text, with or without milliseconds and offset. A value without an offset is UTC, which is
 * how the application and `datetime('now')` write them. Anything else is refused rather than guessed.
 */
export function toInstantIso(stored: string, where: string): string {
  const match = TIMESTAMP.exec(stored.trim());
  if (!match) throw new SnapshotIncompatibleError(`${where}: "${stored}" is not an instant`);
  const [, year, month, day, hour, minute, second, fraction = '', zone] = match;
  if (/[1-9]/.test(fraction.slice(3))) {
    throw new SnapshotIncompatibleError(`${where}: "${stored}" has more than millisecond precision`);
  }
  let epoch = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, Number(fraction.slice(0, 3).padEnd(3, '0')));
  // Date.UTC rolls 2026-13-45 over into a later date; a stored value that is not a real instant must not.
  const check = new Date(epoch);
  if (
    check.getUTCFullYear() !== +year ||
    check.getUTCMonth() !== +month - 1 ||
    check.getUTCDate() !== +day ||
    check.getUTCHours() !== +hour ||
    check.getUTCMinutes() !== +minute ||
    check.getUTCSeconds() !== +second
  ) {
    throw new SnapshotIncompatibleError(`${where}: "${stored}" is not an instant`);
  }
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    epoch -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  const date = new Date(epoch);
  if (Number.isNaN(date.getTime())) throw new SnapshotIncompatibleError(`${where}: "${stored}" is not an instant`);
  return date.toISOString();
}

/** The format TypeORM writes for dates: UTC, milliseconds, no zone designator. */
function toStoredInstant(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '');
}

async function userTables(manager: Pick<EntityManager, 'query'>): Promise<string[]> {
  const rows: { name: string }[] = await manager.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name);
}

/** Stored (non generated) columns in table order; generated columns are derived and never copied. */
async function storedColumns(manager: Pick<EntityManager, 'query'>, table: string): Promise<ColumnInfo[]> {
  const columns: ColumnInfo[] = await manager.query(`PRAGMA table_xinfo(${quote(table)})`);
  return columns.filter((column) => column.hidden === 0);
}

/** Stored columns with their neutral kinds: from the plugin declaration for plugin tables, else the declared type. */
async function columnPlans(
  source: Pick<EntityManager, 'query'>,
  table: string,
  declared: DeclaredColumns,
): Promise<{ columns: ColumnInfo[]; plans: ColumnPlan[] }> {
  const columns = await storedColumns(source, table);
  const fields = declared.get(table);
  const plans = columns.map((column): ColumnPlan => {
    const field = fields?.get(column.name);
    return field
      ? { name: column.name, kind: fieldKind(field), field }
      : { name: column.name, kind: columnKind(column.type) };
  });
  return { columns, plans };
}

function exportValue(plan: ColumnPlan, row: Record<string, unknown>, index: number, where: string): SnapshotValue {
  const { kind } = plan;
  const value = row[`v${index}`];
  const storage = row[`t${index}`];
  if (storage === 'null' || value === null || value === undefined) return null;
  switch (kind) {
    case 'decimal':
    case 'date':
      return exportDeclaredValue(kind, plan.field, value, storage, where);
    case 'boolean':
      if (value === 0 || value === 1) return value === 1;
      throw new SnapshotIncompatibleError(`${where}: ${String(value)} is not a boolean`);
    case 'integer': {
      if (storage !== 'integer') throw new SnapshotIncompatibleError(`${where}: ${String(value)} is not an integer`);
      const exact = String(row[`i${index}`]);
      return Number.isSafeInteger(Number(exact)) ? Number(exact) : { integer: exact };
    }
    case 'real':
      if (typeof value !== 'number') throw new SnapshotIncompatibleError(`${where}: ${String(value)} is not a number`);
      return value;
    case 'timestamp':
      return toInstantIso(String(value), where);
    case 'blob':
      return { blob: Buffer.from(value as Buffer).toString('base64') };
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(row[`i${index}`]);
      throw new SnapshotIncompatibleError(`${where}: unsupported ${storage} value in a text column`);
  }
}

async function exportTable(source: DataSource, table: string, declared: DeclaredColumns): Promise<TableSnapshot> {
  const { columns, plans } = await columnPlans(source, table, declared);
  const selects = columns.flatMap((column, index) => {
    const name = quote(column.name);
    return [
      `${name} AS v${index}`,
      `typeof(${name}) AS t${index}`,
      // Integers beyond 2^53 must not pass through a double; text columns holding numbers keep their digits.
      `CASE WHEN typeof(${name}) IN ('integer', 'real') THEN CAST(${name} AS TEXT) END AS i${index}`,
    ];
  });
  const keys = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
  const order = keys.length > 0 ? keys.map((column) => quote(column.name)).join(', ') : 'rowid';
  const rows: Record<string, unknown>[] =
    columns.length === 0
      ? []
      : await source.query(`SELECT ${selects.join(', ')} FROM ${quote(table)} ORDER BY ${order}`);
  return {
    name: table,
    columns: plans.map(({ name, kind }) => ({ name, kind })),
    rows: rows.map((row) => plans.map((plan, index) => exportValue(plan, row, index, `${table}.${plan.name}`))),
  };
}

async function readMigrations(source: Pick<EntityManager, 'query'>, table: string): Promise<MigrationRecord[]> {
  const exists = await source.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
  if (exists.length === 0) return [];
  const rows: { timestamp: number | string; name: string }[] = await source.query(
    `SELECT timestamp, name FROM ${quote(table)} ORDER BY id`,
  );
  return rows.map((row) => ({ timestamp: Number(row.timestamp), name: row.name }));
}

function bindValue(plan: ColumnPlan, value: SnapshotValue, where: string): unknown {
  if (value === null) return null;
  const { kind } = plan;
  switch (kind) {
    case 'decimal':
    case 'date':
      return bindDeclaredValue(kind, plan.field, value, where);
    case 'boolean':
      return value === true ? 1 : 0;
    case 'integer':
      return typeof value === 'object' ? (value as { integer: string }).integer : value;
    case 'timestamp':
      return toStoredInstant(toInstantIso(String(value), where));
    case 'blob':
      return Buffer.from((value as { blob: string }).blob, 'base64');
    default:
      return value;
  }
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

async function assertPluginsRestorable(
  target: DataSource,
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
  target: DataSource,
  snapshot: DatabaseSnapshot,
  track: MigrationTrack,
  options: ImportSnapshotOptions,
): Promise<Map<string, ColumnPlan[]>> {
  if (snapshot.format !== 1) throw new SnapshotIncompatibleError(`Unsupported snapshot format ${snapshot.format}`);
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
  await assertPluginsRestorable(target, snapshot, options);
  const existing = await userTables(target);
  const described = new Set(snapshot.tables.map((table) => table.name));
  const undescribed = existing.filter((name) => !described.has(name));
  if (undescribed.length > 0) {
    throw new SnapshotIncompatibleError(
      `The database has tables the snapshot does not describe: ${undescribed.join(', ')}`,
    );
  }
  const declared = declaredColumns(options.plugins);
  const plans = new Map<string, ColumnPlan[]>();
  for (const table of snapshot.tables) {
    if (!existing.includes(table.name)) throw new SnapshotIncompatibleError(`The database has no table ${table.name}`);
    const { plans: columns } = await columnPlans(target, table.name, declared);
    if (
      !sameNames(
        columns.map((c) => `${c.name}:${c.kind}`),
        table.columns.map((c) => `${c.name}:${c.kind}`),
      )
    ) {
      throw new SnapshotIncompatibleError(`The columns of table ${table.name} differ from the snapshot`);
    }
    plans.set(table.name, columns);
  }
  return plans;
}

async function loadTable(manager: EntityManager, table: TableSnapshot, plans: readonly ColumnPlan[]): Promise<void> {
  if (table.columns.length === 0 || table.rows.length === 0) return;
  const names = table.columns.map((column) => quote(column.name)).join(', ');
  // SQLite allows 32766 bound variables per statement from 3.32; stay far below older limits.
  const perStatement = Math.max(1, Math.floor(900 / table.columns.length));
  for (let start = 0; start < table.rows.length; start += perStatement) {
    const chunk = table.rows.slice(start, start + perStatement);
    const placeholders = chunk.map(() => `(${table.columns.map(() => '?').join(', ')})`).join(', ');
    const params = chunk.flatMap((row, offset) =>
      row.map((value, index) =>
        bindValue(plans[index], value, `${table.name}[${start + offset}].${table.columns[index].name}`),
      ),
    );
    await manager.query(`INSERT INTO ${quote(table.name)} (${names}) VALUES ${placeholders}`, params);
  }
}

/**
 * The SQLite transfer. Restoring replaces every table inside one transaction with foreign keys deferred to a final
 * check and the maintenance triggers (balances) dropped while rows are copied and recreated before commit, so derived
 * data is taken from the snapshot instead of being applied a second time.
 */
export function createSqliteTransfer(track: MigrationTrack): DatabaseTransfer {
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
      const sequenceTable = await source.query("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'");
      const sequences: Record<string, number> = {};
      if (sequenceTable.length > 0) {
        const rows: { name: string; seq: number }[] = await source.query(
          'SELECT name, seq FROM sqlite_sequence ORDER BY name',
        );
        for (const row of rows) sequences[row.name] = row.seq;
      }
      return {
        format: 1,
        backend: 'sqlite',
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
      const [{ foreign_keys: foreignKeys }] = await target.query('PRAGMA foreign_keys');
      // The pragma is a no-op inside a transaction, so it is switched before and restored after.
      await target.query('PRAGMA foreign_keys = OFF');
      try {
        await target.transaction(async (manager) => {
          const triggers: { name: string; sql: string }[] = await manager.query(
            "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'",
          );
          for (const trigger of triggers) await manager.query(`DROP TRIGGER ${quote(trigger.name)}`);
          for (const table of snapshot.tables) await manager.query(`DELETE FROM ${quote(table.name)}`);
          for (const table of snapshot.tables) await loadTable(manager, table, plans.get(table.name) ?? []);
          // Generated keys continue after the highest id the source ever issued, also after deletes.
          await manager.query('DELETE FROM sqlite_sequence');
          for (const [name, seq] of Object.entries(snapshot.sequences)) {
            await manager.query('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', [name, seq]);
          }
          for (const trigger of triggers) await manager.query(trigger.sql);
          const violations = await manager.query('PRAGMA foreign_key_check');
          if (violations.length > 0) {
            throw new SnapshotIncompatibleError(
              `The snapshot breaks foreign keys: ${JSON.stringify(violations.slice(0, 5))}`,
            );
          }
        });
      } finally {
        await target.query(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
      }
    },
  };
}
