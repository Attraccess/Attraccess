import type { EntityManager } from 'typeorm';
import { type CompiledField, versionsTableName } from '../../plugin-system/plugin-storage/storage-model';
import { normalizeDecimal } from '../../plugin-system/plugin-storage/storage-values';
import {
  SnapshotIncompatibleError,
  type PluginDescriptor,
  type SnapshotColumnKind,
  type SnapshotValue,
} from '../transfer-snapshot';
import { sqliteStorageDialect } from './plugin-storage/sqlite-storage-dialect';

/** The fields plugins declared, by physical table and physical column. */
export type DeclaredColumns = ReadonlyMap<string, ReadonlyMap<string, CompiledField>>;

type Query = Pick<EntityManager, 'query'>;

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

const FIELD_KINDS: Record<CompiledField['type'], SnapshotColumnKind> = {
  string: 'text',
  text: 'text',
  uuid: 'text',
  json: 'text',
  integer: 'integer',
  decimal: 'decimal',
  boolean: 'boolean',
  timestamp: 'timestamp',
  date: 'date',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The physical tables of a plugin's declared storage, as the record port serves them. */
export function declaredTables(plugin: PluginDescriptor): string[] {
  return [...plugin.storage.tables.values()].map((table) => table.physical);
}

export function declaredColumns(plugins: readonly PluginDescriptor[] = []): DeclaredColumns {
  const tables = new Map<string, Map<string, CompiledField>>();
  for (const plugin of plugins) {
    for (const table of plugin.storage.tables.values()) {
      tables.set(table.physical, new Map([...table.fields.values()].map((field) => [field.column, field])));
    }
  }
  return tables;
}

/** The neutral kind of a declared plugin field: what the value means, not how SQLite stores it. */
export function fieldKind(field: CompiledField): SnapshotColumnKind {
  return FIELD_KINDS[field.type];
}

function declared(field: CompiledField | undefined, where: string): CompiledField {
  if (!field) throw new SnapshotIncompatibleError(`${where}: no plugin storage declaration types this column`);
  return field;
}

/** A stored plugin decimal (a scaled integer) or date as its neutral snapshot value. */
export function exportDeclaredValue(
  kind: 'decimal' | 'date',
  field: CompiledField | undefined,
  stored: unknown,
  storage: unknown,
  where: string,
): SnapshotValue {
  if (kind === 'decimal') {
    if (storage !== 'integer') throw new SnapshotIncompatibleError(`${where}: ${String(stored)} is not a decimal`);
    return sqliteStorageDialect.decode(declared(field, where), stored) as string;
  }
  const date = String(stored);
  if (!DATE.test(date)) throw new SnapshotIncompatibleError(`${where}: "${date}" is not a date`);
  return date;
}

/** A neutral plugin decimal or date as SQLite stores it for the declared field of the target. */
export function bindDeclaredValue(
  kind: 'decimal' | 'date',
  field: CompiledField | undefined,
  value: SnapshotValue,
  where: string,
): unknown {
  if (typeof value !== 'string')
    throw new SnapshotIncompatibleError(`${where}: ${JSON.stringify(value)} is not a ${kind}`);
  if (kind === 'date') {
    if (!DATE.test(value)) throw new SnapshotIncompatibleError(`${where}: "${value}" is not a date`);
    return value;
  }
  const target = declared(field, where);
  try {
    return sqliteStorageDialect.encode(target, normalizeDecimal(target, where, value));
  } catch (error) {
    throw new SnapshotIncompatibleError(`${where}: ${(error as Error).message}`);
  }
}

/** The storage versions recorded for a plugin namespace, ascending; empty when the plugin never migrated here. */
export async function appliedStorageVersions(source: Query, namespace: string): Promise<number[]> {
  const table = versionsTableName(namespace);
  const exists = await source.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
  if (exists.length === 0) return [];
  const rows: { version: number }[] = await source.query(`SELECT "version" FROM ${quote(table)} ORDER BY "version"`);
  return rows.map((row) => Number(row.version));
}
