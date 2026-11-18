import type { EntityManager } from 'typeorm';
import { SnapshotIncompatibleError, type SnapshotValue, type TableSnapshot } from '../transfer-snapshot';
import type { ColumnPlan } from './postgres-transfer-values';

const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** PostgreSQL accepts 65535 bind parameters per statement. */
const MAX_PARAMETERS = 60_000;

/**
 * A failure as it may be logged: the SQLSTATE, the constraint and the column. Never the driver's message or detail
 * (they can quote row values such as password hashes or tokens).
 */
export function describePostgresError(error: unknown): string {
  const failure =
    (error as { driverError?: Record<string, unknown> })?.driverError ?? (error as Record<string, unknown>);
  const parts = [`SQLSTATE ${String(failure?.code ?? 'unknown')}`];
  if (failure?.constraint) parts.push(`constraint ${String(failure.constraint)}`);
  if (failure?.column) parts.push(`column ${String(failure.column)}`);
  if (failure?.dataType) parts.push(`type ${String(failure.dataType)}`);
  return parts.join(', ');
}

export interface LoadOptions {
  bind(plan: ColumnPlan, value: SnapshotValue, where: string): unknown;
  placeholder(index: number, plan: ColumnPlan): string;
}

type Query = Pick<EntityManager, 'query'>;

function insertSql(table: TableSnapshot, plans: readonly ColumnPlan[], rows: number, options: LoadOptions): string {
  const names = plans.map((plan) => quote(plan.name)).join(', ');
  const tuples: string[] = [];
  for (let row = 0; row < rows; row++) {
    tuples.push(`(${plans.map((plan, col) => options.placeholder(row * plans.length + col + 1, plan)).join(', ')})`);
  }
  return `INSERT INTO ${quote(table.name)} (${names}) VALUES ${tuples.join(', ')}`;
}

/** The columns of `table.columns` in the order of the target's plans (the snapshot may list them differently). */
function arrange(table: TableSnapshot, plans: readonly ColumnPlan[]): number[] {
  return plans.map((plan) => table.columns.findIndex((column) => column.name === plan.name));
}

/**
 * Copies the rows of one table in chunks. When a chunk fails, its rows are retried one by one to name the first
 * offending row (table, row number, key columns of the primary key if the table has an id) before the error is raised.
 */
export async function loadTableRows(
  manager: Query,
  table: TableSnapshot,
  plans: readonly ColumnPlan[],
  options: LoadOptions,
): Promise<void> {
  if (plans.length === 0 || table.rows.length === 0) return;
  const order = arrange(table, plans);
  const perStatement = Math.max(1, Math.floor(MAX_PARAMETERS / plans.length));
  const params = (rowIndex: number): unknown[] =>
    plans.map((plan, col) =>
      options.bind(plan, table.rows[rowIndex][order[col]], `${table.name}[${rowIndex}].${plan.name}`),
    );
  for (let start = 0; start < table.rows.length; start += perStatement) {
    const end = Math.min(table.rows.length, start + perStatement);
    const values: unknown[] = [];
    for (let row = start; row < end; row++) values.push(...params(row));
    try {
      await manager.query('SAVEPOINT load_chunk');
      await manager.query(insertSql(table, plans, end - start, options), values);
      await manager.query('RELEASE SAVEPOINT load_chunk');
    } catch (chunkError) {
      await manager.query('ROLLBACK TO SAVEPOINT load_chunk');
      await locateFailure(manager, table, plans, options, start, end, params, chunkError);
    }
  }
}

async function locateFailure(
  manager: Query,
  table: TableSnapshot,
  plans: readonly ColumnPlan[],
  options: LoadOptions,
  start: number,
  end: number,
  params: (rowIndex: number) => unknown[],
  chunkError: unknown,
): Promise<never> {
  const idColumn = table.columns.findIndex((column) => column.name === 'id');
  for (let row = start; row < end; row++) {
    try {
      await manager.query('SAVEPOINT load_row');
      await manager.query(insertSql(table, plans, 1, options), params(row));
      await manager.query('RELEASE SAVEPOINT load_row');
    } catch (rowError) {
      await manager.query('ROLLBACK TO SAVEPOINT load_row');
      const id = idColumn >= 0 ? ` (id ${JSON.stringify(table.rows[row][idColumn])})` : '';
      throw new SnapshotIncompatibleError(
        `Table ${table.name}, row ${row + 1}${id} cannot be imported: ${describePostgresError(rowError)}`,
      );
    }
  }
  throw new SnapshotIncompatibleError(`Table ${table.name} cannot be imported: ${describePostgresError(chunkError)}`);
}
