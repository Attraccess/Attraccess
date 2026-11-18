import type { CompiledField } from '../../plugin-system/plugin-storage/storage-model';
import { normalizeDecimal } from '../../plugin-system/plugin-storage/storage-values';
import { DATE_PATTERN } from '../transfer-declared';
import {
  SnapshotIncompatibleError,
  type SnapshotColumn,
  type SnapshotColumnKind,
  type SnapshotValue,
} from '../transfer-snapshot';

/** A snapshot column with the plugin field that types it, if a plugin declared the table. */
export interface ColumnPlan extends SnapshotColumn {
  readonly field?: CompiledField;
  /** The PostgreSQL data type (information_schema), used to cast bound text where the driver would guess. */
  readonly pgType: string;
}

/** The neutral kind of a core column from its PostgreSQL type. */
export function kindOfPgType(dataType: string): SnapshotColumnKind {
  switch (dataType) {
    case 'smallint':
    case 'integer':
    case 'bigint':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return 'timestamp';
    case 'double precision':
    case 'real':
      return 'real';
    case 'bytea':
      return 'blob';
    case 'date':
      return 'date';
    case 'numeric':
      return 'decimal';
    default:
      return 'text';
  }
}

/** The SQL expression that reads a column so that the driver hands back its exact, neutral text form. */
export function selectExpression(column: string, plan: ColumnPlan): string {
  const quoted = `"${column.replace(/"/g, '""')}"`;
  switch (plan.kind) {
    case 'integer':
    case 'decimal':
      return `${quoted}::text`;
    case 'timestamp':
      // ISO-8601 UTC with milliseconds, whatever the session time zone is.
      return `to_char(${quoted} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    case 'date':
      return `to_char(${quoted}, 'YYYY-MM-DD')`;
    case 'text':
      return plan.pgType === 'json' || plan.pgType === 'jsonb' ? `${quoted}::text` : quoted;
    default:
      return quoted;
  }
}

export function exportValue(plan: ColumnPlan, value: unknown, where: string): SnapshotValue {
  if (value === null || value === undefined) return null;
  switch (plan.kind) {
    case 'integer': {
      const digits = String(value);
      const asNumber = Number(digits);
      return Number.isSafeInteger(asNumber) ? asNumber : { integer: digits };
    }
    case 'decimal':
    case 'date':
    case 'timestamp':
      return String(value);
    case 'boolean':
      return value === true;
    case 'real':
      return Number(value);
    case 'blob':
      return { blob: Buffer.from(value as Buffer).toString('base64') };
    case 'text':
      if (typeof value === 'string') return value;
      throw new SnapshotIncompatibleError(`${where}: unsupported ${typeof value} value in a text column`);
  }
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** A neutral snapshot value as a bound parameter of the target column. */
export function bindValue(plan: ColumnPlan, value: SnapshotValue, where: string): unknown {
  if (value === null) return null;
  switch (plan.kind) {
    case 'boolean':
      if (typeof value !== 'boolean')
        throw new SnapshotIncompatibleError(`${where}: ${String(value)} is not a boolean`);
      return value;
    case 'integer':
      return typeof value === 'object' ? (value as { integer: string }).integer : value;
    case 'timestamp':
      if (typeof value !== 'string' || !INSTANT.test(value)) {
        throw new SnapshotIncompatibleError(`${where}: ${JSON.stringify(value)} is not an ISO-8601 UTC instant`);
      }
      return value;
    case 'blob':
      return Buffer.from((value as { blob: string }).blob, 'base64');
    case 'date':
      if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
        throw new SnapshotIncompatibleError(`${where}: ${JSON.stringify(value)} is not a date`);
      }
      return value;
    case 'decimal': {
      if (typeof value !== 'string')
        throw new SnapshotIncompatibleError(`${where}: ${JSON.stringify(value)} is not a decimal`);
      if (!plan.field) return value;
      try {
        return normalizeDecimal(plan.field, where, value);
      } catch (error) {
        throw new SnapshotIncompatibleError(`${where}: ${(error as Error).message}`);
      }
    }
    default:
      return value;
  }
}

/** The text cast PostgreSQL needs when the driver sends a parameter without a type (json documents, blobs stay as is). */
export function placeholder(index: number, plan: ColumnPlan): string {
  const base = `$${index}`;
  return plan.pgType === 'json' || plan.pgType === 'jsonb' ? `${base}::${plan.pgType}` : base;
}
