// The plugin tables a backup carries and a restore replaces. The connection settings (which hold an encrypted
// credential bound to this host) and the backup feature's own tables are deliberately not part of it.
import type { EntityManager } from 'typeorm';
import {
  MatterCommand,
  MatterEndpoint,
  MatterEndpointCapability,
  MatterEndpointCluster,
  MatterEndpointState,
  MatterFabric,
  MatterNode,
  MatterReconciliationStatus,
} from '../devices/entities';
import type { TableRows } from './format';

export const PLUGIN_TABLES = [
  ['plugin_matter_fabrics', MatterFabric],
  ['plugin_matter_nodes', MatterNode],
  ['plugin_matter_endpoints', MatterEndpoint],
  ['plugin_matter_endpoint_clusters', MatterEndpointCluster],
  ['plugin_matter_endpoint_capabilities', MatterEndpointCapability],
  ['plugin_matter_endpoint_state', MatterEndpointState],
  ['plugin_matter_commands', MatterCommand],
  ['plugin_matter_reconciliation_status', MatterReconciliationStatus],
] as const;

/** Every row of every plugin table, as plain column/value objects. */
export async function readTables(manager: EntityManager): Promise<TableRows> {
  const tables: TableRows = {};
  for (const [table] of PLUGIN_TABLES) {
    tables[table] = (await manager.query(`SELECT * FROM "${table}"`)) as Record<string, unknown>[];
  }
  return tables;
}

/** The columns of each plugin table: the only names a restore accepts. */
export function tableColumns(manager: EntityManager): Map<string, Set<string>> {
  return new Map(
    PLUGIN_TABLES.map(([table, entity]) => [
      table,
      new Set(manager.connection.getMetadata(entity).columns.map((column) => column.databaseName)),
    ]),
  );
}

type Scalar = string | number | boolean | null;

/** Whether tables from a backup may be written: known tables, known columns, scalar values only. */
export function tablesAreAcceptable(manager: EntityManager, tables: TableRows): boolean {
  const columns = tableColumns(manager);
  for (const [table, rows] of Object.entries(tables)) {
    const allowed = columns.get(table);
    if (!allowed) return false;
    for (const row of rows) {
      for (const [name, value] of Object.entries(row)) {
        if (!allowed.has(name)) return false;
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return false;
      }
    }
  }
  return true;
}

/** Replaces the content of every plugin table with the backup's, inside the caller's transaction. */
export async function replaceTables(manager: EntityManager, tables: TableRows): Promise<void> {
  for (const [table] of PLUGIN_TABLES) await manager.query(`DELETE FROM "${table}"`);
  for (const [table] of PLUGIN_TABLES) {
    for (const row of tables[table] ?? []) {
      const names = Object.keys(row);
      if (names.length === 0) continue;
      await manager.query(
        `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        names.map((name) => row[name] as Scalar),
      );
    }
  }
}
