import type { CompiledField } from '../plugin-system/plugin-storage/storage-model';
import type { PluginDescriptor, SnapshotColumnKind } from './transfer-snapshot';

/** The fields plugins declared, by physical table and physical column. */
export type DeclaredColumns = ReadonlyMap<string, ReadonlyMap<string, CompiledField>>;

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

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

/** The neutral kind of a declared plugin field: what the value means, not how an engine stores it. */
export function fieldKind(field: CompiledField): SnapshotColumnKind {
  return FIELD_KINDS[field.type];
}
