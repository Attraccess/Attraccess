import type { EntityManager } from 'typeorm';
import { type CompiledField, versionsTableName } from '../../plugin-system/plugin-storage/storage-model';
import { normalizeDecimal } from '../../plugin-system/plugin-storage/storage-values';
import { SnapshotIncompatibleError, type SnapshotValue } from '../transfer-snapshot';
import { DATE_PATTERN } from '../transfer-declared';
import { sqliteStorageDialect } from './plugin-storage/sqlite-storage-dialect';

export { declaredColumns, declaredTables, fieldKind, type DeclaredColumns } from '../transfer-declared';
const DATE = DATE_PATTERN;

type Query = Pick<EntityManager, 'query'>;

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

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
