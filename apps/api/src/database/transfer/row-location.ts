/**
 * How the transfer names a row in its errors, on both sides: `table user, row 3 (id 7)`. The row number counts from 1
 * in the order the rows are read (primary key order); the key names the primary key columns when the table has one.
 */
export function rowLocation(
  table: string,
  rowNumber: number,
  key: ReadonlyArray<readonly [string, unknown]> = [],
): string {
  const keyText = key.map(([column, value]) => `${column} ${keyValue(value)}`).join(', ');
  return `table ${table}, row ${rowNumber}${keyText ? ` (${keyText})` : ''}`;
}

/** The location of one value: `table user, row 3 (id 7), column createdAt`. */
export function cellLocation(row: string, column: string): string {
  return `${row}, column ${column}`;
}

function keyValue(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value && typeof value === 'object' && 'integer' in value) return String((value as { integer: unknown }).integer);
  return JSON.stringify(value) ?? String(value);
}
