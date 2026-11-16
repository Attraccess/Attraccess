// Pure CSV helpers for the export page
// FEATURE: CSV export — configured columns (fields, constants, custom headers) to escaped CSV text

export const CSV_SEPARATOR = ';';

/** Mirrors the API's template limit; a template with more columns is rejected. */
export const MAX_COLUMNS = 200;

/**
 * A column as configured in the editor. Field columns reference a data field by `fieldKey`,
 * constant columns emit `value` on every row.
 *
 * `fieldKey` values are persisted in templates, so field keys must stay stable: renaming one
 * silently breaks every template that references it.
 */
export interface ConfiguredColumn {
  /** Local identity for React keys and reordering only; never persisted. */
  uid: string;
  type: 'field' | 'constant';
  fieldKey?: string;
  /** Empty means: use the field's default label. */
  header: string;
  value?: string;
}

export interface FieldDefinition<TItem> {
  key: string;
  label: string;
  getter: (item: TItem) => unknown;
  selectedByDefault?: boolean;
}

export interface ResolvedColumn<TItem> {
  uid: string;
  header: string;
  /** False when a field column points at a key that does not exist in the current data. */
  isAvailable: boolean;
  getValue: (item: TItem) => string;
}

/**
 * Quote a cell when it contains the separator, a quote, CR or LF; embedded quotes are doubled.
 * Unlike the audit-log export, leading `= + - @` are deliberately NOT neutralised: these files are
 * uploaded into other systems, which need the raw values (e.g. negative amounts). The docs warn about it.
 */
export function escapeCsvValue(value: string): string {
  if (/["\n\r]/.test(value) || value.includes(CSV_SEPARATOR)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Null and undefined become empty cells, everything else is stringified. */
export function stringifyCell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

const emptyCell = () => '';

// named (instead of an inline arrow in the column object) so the CRAP tooling can match it to its complexity data
function cellGetter<TItem>(field: FieldDefinition<TItem>) {
  return (item: TItem) => stringifyCell(field.getter(item));
}

export function resolveColumns<TItem>(
  configured: ConfiguredColumn[],
  fields: FieldDefinition<TItem>[],
): ResolvedColumn<TItem>[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));

  return configured.map((column) => {
    if (column.type === 'constant') {
      const value = column.value ?? '';
      return { uid: column.uid, header: column.header, isAvailable: true, getValue: () => value };
    }

    const field = column.fieldKey === undefined ? undefined : byKey.get(column.fieldKey);
    return {
      uid: column.uid,
      // a stale field has no label, its key is the best hint left for the header
      header: column.header === '' ? (field?.label ?? column.fieldKey ?? '') : column.header,
      isAvailable: field !== undefined,
      getValue: field ? cellGetter(field) : emptyCell,
    };
  });
}

export function buildCsv<TItem>(columns: ResolvedColumn<TItem>[], items: TItem[]): string {
  const lines = [columns.map((column) => escapeCsvValue(column.header)).join(CSV_SEPARATOR)];
  for (const item of items) {
    lines.push(columns.map((column) => escapeCsvValue(column.getValue(item))).join(CSV_SEPARATOR));
  }
  return lines.join('\n');
}

let uidCounter = 0;
/** Uids for columns added by the user or loaded from a template; never collide with default uids. */
export function newColumnUid(): string {
  uidCounter += 1;
  return `col-${uidCounter}`;
}

/**
 * The export type's default columns. Their uids are derived from the (unique) field key, so
 * rebuilding the field list (page arrival, refetch) keeps every row and preview column mounted.
 */
export function defaultColumns<TItem>(fields: FieldDefinition<TItem>[]): ConfiguredColumn[] {
  return fields
    .filter((field) => field.selectedByDefault)
    .map((field) => ({ uid: `default:${field.key}`, type: 'field', fieldKey: field.key, header: '' }));
}

/** Strip the local `uid` and fields that do not apply to the column type, ready for the template API. */
export function toTemplateColumns(columns: ConfiguredColumn[]) {
  return columns.map((column) =>
    column.type === 'constant'
      ? { type: 'constant' as const, header: column.header, value: column.value ?? '' }
      : { type: 'field' as const, header: column.header, fieldKey: column.fieldKey ?? '' },
  );
}

export function fromTemplateColumns(
  columns: Array<{ type: 'field' | 'constant'; header: string; fieldKey?: string | null; value?: string | null }>,
): ConfiguredColumn[] {
  return columns.map((column) => ({
    uid: newColumnUid(),
    type: column.type,
    header: column.header,
    ...(column.type === 'field' ? { fieldKey: column.fieldKey ?? '' } : { value: column.value ?? '' }),
  }));
}

export const RESOURCE_METADATA_PREFIX = 'resourceMetadata.';

/** Collects metadata keys in a single pass over the rows (first-seen order). */
export function collectMetadataKeys<TItem>(
  items: TItem[],
  getMetadata: (item: TItem) => Record<string, unknown> | null | undefined,
): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    const metadata = getMetadata(item);
    if (!metadata) continue;
    for (const key of Object.keys(metadata)) keys.add(key);
  }
  return [...keys];
}

/** Strings as-is, objects and arrays as JSON, null/undefined empty. */
export function stringifyMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function metadataFields<TItem>(
  items: TItem[],
  getMetadata: (item: TItem) => Record<string, unknown> | null | undefined,
  label: (key: string) => string,
): FieldDefinition<TItem>[] {
  return collectMetadataKeys(items, getMetadata).map((key) => ({
    key: `${RESOURCE_METADATA_PREFIX}${key}`,
    label: label(key),
    getter: (item) => stringifyMetadataValue(getMetadata(item)?.[key]),
  }));
}
