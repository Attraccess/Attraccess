import type { ResolvedStep } from '../../../plugin-system/plugin-storage/storage-model';

/** Reads the catalog of the database the migration runs on. */
export type SchemaQuery = (sql: string, params?: readonly unknown[]) => Promise<Record<string, unknown>[]>;

/** Thrown before any statement of a step runs; the migration's transaction rolls back. */
export class PluginStorageStepUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginStorageStepUnsupported';
  }
}

const CONSTRAINT_LIMIT =
  'Removing it needs the constraint dropped first, which Attraccess does not do for plugin storage. Nothing was changed.';

/**
 * An index the plugin drops must be one of its own table's and a plain index. An index that backs a constraint (a
 * UNIQUE constraint or the primary key of a table adopted in place) cannot be removed with DROP INDEX.
 */
async function checkDropIndex(query: SchemaQuery, step: Extract<ResolvedStep, { op: 'dropIndex' }>): Promise<void> {
  const { table, index } = step;
  const [row] = await query(
    `SELECT t.relname AS "table",
            EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid) AS "constraint"
       FROM pg_class i
       JOIN pg_namespace n ON n.oid = i.relnamespace
       JOIN pg_index x ON x.indexrelid = i.oid
       JOIN pg_class t ON t.oid = x.indrelid
      WHERE i.relkind = 'i' AND n.nspname = current_schema() AND i.relname = $1`,
    [index.name],
  );
  if (!row) throw new PluginStorageStepUnsupported(`The index "${index.name}" of "${table.physical}" does not exist.`);
  if (String(row.table) !== table.physical) {
    throw new PluginStorageStepUnsupported(
      `The index "${index.name}" belongs to the table "${String(row.table)}", not to "${table.physical}"; ` +
        'a plugin may only drop indexes of its own tables. Nothing was changed.',
    );
  }
  if (row.constraint === true) {
    throw new PluginStorageStepUnsupported(
      `The index "${index.name}" of "${table.physical}" backs a constraint of the table. ${CONSTRAINT_LIMIT}`,
    );
  }
}

/**
 * PostgreSQL drops the indexes and constraints that use a dropped column along with it. The host refuses instead:
 * dropping a column must not silently remove a key, a UNIQUE or CHECK constraint, or a foreign key of a table
 * adopted in place. Declared indexes are refused when the declaration is compiled; this finds what remains.
 */
async function checkDropColumn(query: SchemaQuery, step: Extract<ResolvedStep, { op: 'dropColumn' }>): Promise<void> {
  const { table, field } = step;
  const [index] = await query(
    `SELECT i.relname AS "name"
       FROM pg_index x
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
      WHERE n.nspname = current_schema() AND t.relname = $1 AND a.attname = $2 AND NOT a.attisdropped
      LIMIT 1`,
    [table.physical, field.column],
  );
  if (index) {
    throw new PluginStorageStepUnsupported(
      `The column "${field.column}" of "${table.physical}" is part of the index or key "${String(index.name)}" of the ` +
        `table, so it cannot be dropped. ${CONSTRAINT_LIMIT}`,
    );
  }
  const [constraint] = await query(
    `SELECT c.conname AS "name"
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
      WHERE n.nspname = current_schema() AND t.relname = $1 AND a.attname = $2 AND NOT a.attisdropped
      LIMIT 1`,
    [table.physical, field.column],
  );
  if (constraint) {
    throw new PluginStorageStepUnsupported(
      `The column "${field.column}" of "${table.physical}" is used by the constraint "${String(constraint.name)}" of ` +
        `the table, so it cannot be dropped. ${CONSTRAINT_LIMIT}`,
    );
  }
}

/** Refuses a step that would change more than it says, or that names an object the plugin does not own. */
export async function checkPostgresStep(query: SchemaQuery, step: ResolvedStep): Promise<void> {
  if (step.op === 'dropIndex') await checkDropIndex(query, step);
  else if (step.op === 'dropColumn') await checkDropColumn(query, step);
}
