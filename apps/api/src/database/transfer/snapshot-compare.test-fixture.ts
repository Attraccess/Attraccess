import type { DatabaseSnapshot, SnapshotValue, TableSnapshot } from '../transfer-snapshot';

/** Tables that belong to one engine's own bookkeeping and never cross engines. */
const BOOKKEEPING = new Set(['migrations', 'typeorm_metadata', 'sqlite_sequence']);

/** Trailing zeros of a decimal carry no value: PostgreSQL pads to the column scale, SQLite keeps what was written. */
function trimDecimal(text: string): string {
  return /^-?\d+\.\d+$/.test(text) ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/**
 * A value in the form both engines agree on. Text that holds JSON compares as parsed JSON (jsonb normalises spacing
 * and key order); decimals compare without trailing zeros; integers beyond a double are tagged `{ integer }`.
 */
export function normalizeValue(value: SnapshotValue): unknown {
  if (typeof value !== 'string') return value;
  if (/^\s*[[{]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return trimDecimal(value);
}

/** JSON text with sorted object keys: jsonb reorders keys, equal documents must compare equal. */
function canonical(value: unknown): string {
  const sorted = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(sorted)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sorted(v)]),
          )
        : input;
  return JSON.stringify(sorted(value));
}

export interface TableDifference {
  readonly table: string;
  readonly detail: string;
}

const byName = (snapshot: DatabaseSnapshot): Map<string, TableSnapshot> =>
  new Map(snapshot.tables.filter((table) => !BOOKKEEPING.has(table.name)).map((table) => [table.name, table]));

function rowsOf(table: TableSnapshot, columns: readonly string[]): unknown[][] {
  const indexes = columns.map((name) => table.columns.findIndex((column) => column.name === name));
  return table.rows.map((row) => indexes.map((index) => normalizeValue(row[index])));
}

/**
 * Compares two neutral snapshots table by table, column by column, row by row (the export orders by primary key):
 * the generic proof that nothing was lost, changed or reordered by moving a database to another engine. Returns the
 * differences; an empty list means equal.
 */
export function compareSnapshots(expected: DatabaseSnapshot, actual: DatabaseSnapshot): TableDifference[] {
  const differences: TableDifference[] = [];
  const left = byName(expected);
  const right = byName(actual);
  for (const name of left.keys()) {
    if (!right.has(name)) differences.push({ table: name, detail: 'missing in the target' });
  }
  for (const name of right.keys()) {
    if (!left.has(name)) differences.push({ table: name, detail: 'only in the target' });
  }
  for (const [name, source] of left) {
    const target = right.get(name);
    if (!target) continue;
    const sourceColumns = source.columns.map((column) => column.name).sort();
    const targetColumns = target.columns.map((column) => column.name).sort();
    if (JSON.stringify(sourceColumns) !== JSON.stringify(targetColumns)) {
      differences.push({ table: name, detail: `columns differ: ${sourceColumns} vs ${targetColumns}` });
      continue;
    }
    if (source.rows.length !== target.rows.length) {
      differences.push({ table: name, detail: `row count ${source.rows.length} vs ${target.rows.length}` });
      continue;
    }
    const a = rowsOf(source, sourceColumns);
    const b = rowsOf(target, sourceColumns);
    a.forEach((row, index) => {
      if (canonical(row) !== canonical(b[index])) {
        const differing = sourceColumns.filter((_, column) => canonical(row[column]) !== canonical(b[index][column]));
        differences.push({
          table: name,
          detail: `row ${index} differs in ${differing.join(', ')}: ${JSON.stringify(differing.map((c) => [row[sourceColumns.indexOf(c)], b[index][sourceColumns.indexOf(c)]]))}`,
        });
      }
    });
  }
  return differences;
}

/** Row counts by table (bookkeeping excluded), for the "row counts per table equal source" assertion. */
export function rowCounts(snapshot: DatabaseSnapshot): Record<string, number> {
  return Object.fromEntries([...byName(snapshot)].map(([name, table]) => [name, table.rows.length]));
}
