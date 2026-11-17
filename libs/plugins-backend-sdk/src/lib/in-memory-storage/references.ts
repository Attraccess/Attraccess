import { PluginStorageInvalid, type PluginStorageForeignKey } from '../plugin-storage';
import type { TableMeta } from './schema';
import type { StorageState } from './state';
import type { Row } from './values';

const keyOf = (row: Row, fields: readonly string[]): string | null => {
  const values = fields.map((name) => row[name]);
  if (values.some((value) => value === null)) return null;
  return JSON.stringify(values.map((value) => (value instanceof Date ? value.toISOString() : value)));
};

/** Foreign keys (child table, key) that point at `parent`. */
function incoming(metas: ReadonlyMap<string, TableMeta>, parent: string) {
  return [...metas.values()].flatMap((child) =>
    child.foreignKeys.filter((fk) => fk.references === parent).map((fk) => ({ child, fk })),
  );
}

function keySet(rows: readonly Row[], fields: readonly string[]): Set<string> {
  return new Set(rows.map((row) => keyOf(row, fields)).filter((key): key is string => key !== null));
}

function assertResolves(
  state: StorageState,
  child: TableMeta,
  fk: PluginStorageForeignKey,
  rows: readonly Row[],
): void {
  const parents = keySet(state.table(fk.references), fk.referencedFields);
  for (const row of rows) {
    const key = keyOf(row, fk.fields);
    if (key !== null && !parents.has(key)) {
      throw new PluginStorageInvalid(
        `${child.name}: foreign key (${fk.fields.join(', ')}) references no row in "${fk.references}".`,
      );
    }
  }
}

/** Verifies every foreign key that involves `table`, as a child and as a parent. */
export function verifyReferences(metas: ReadonlyMap<string, TableMeta>, state: StorageState, table: string): void {
  const own = metas.get(table);
  for (const fk of own?.foreignKeys ?? []) assertResolves(state, own as TableMeta, fk, state.table(table));
  for (const { child, fk } of incoming(metas, table)) assertResolves(state, child, fk, state.table(child.name));
}

function nullOut(metas: ReadonlyMap<string, TableMeta>, child: TableMeta, fk: PluginStorageForeignKey, row: Row): Row {
  const cleared: Row = { ...row };
  for (const name of fk.fields) {
    if (child.fields[name].nullable !== true) {
      throw new PluginStorageInvalid(`${child.name}.${name} is not nullable; it cannot be set to null on delete.`);
    }
    cleared[name] = null;
  }
  return cleared;
}

/**
 * Removes `doomed` rows of `table` and applies the foreign key actions of the rows that point at them: cascade
 * deletes them, set-null clears the key, anything else refuses the delete. The caller rolls back on an error.
 */
export function deleteWithReferences(
  metas: ReadonlyMap<string, TableMeta>,
  state: StorageState,
  table: string,
  doomed: ReadonlySet<Row>,
): void {
  if (doomed.size === 0) return;
  const remaining = state.table(table).filter((row) => !doomed.has(row));
  state.setTable(table, remaining);
  for (const { child, fk } of incoming(metas, table)) {
    const dead = keySet([...doomed], fk.referencedFields);
    const children = state.table(child.name).filter((row) => {
      const key = keyOf(row, fk.fields);
      return key !== null && dead.has(key);
    });
    if (children.length === 0) continue;
    // A parent key that survives in another row (a unique key shared with nothing) is not orphaned.
    const survivors = keySet(remaining, fk.referencedFields);
    const orphans = children.filter((row) => !survivors.has(keyOf(row, fk.fields) as string));
    if (orphans.length === 0) continue;
    applyAction(metas, state, child, fk, new Set(orphans));
  }
}

function applyAction(
  metas: ReadonlyMap<string, TableMeta>,
  state: StorageState,
  child: TableMeta,
  fk: PluginStorageForeignKey,
  orphans: ReadonlySet<Row>,
): void {
  if (fk.onDelete === 'cascade') return deleteWithReferences(metas, state, child.name, orphans);
  if (fk.onDelete === 'set-null') {
    state.setTable(
      child.name,
      state.table(child.name).map((row) => (orphans.has(row) ? nullOut(metas, child, fk, row) : row)),
    );
    return;
  }
  throw new PluginStorageInvalid(
    `${child.name}: rows still reference the deleted row of "${fk.references}" (foreign key (${fk.fields.join(', ')})).`,
  );
}
