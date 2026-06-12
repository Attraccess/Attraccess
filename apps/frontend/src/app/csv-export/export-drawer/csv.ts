// Pure CSV building helpers for the export drawer
// FEATURE: CSV export — configured columns (fields, constants, custom headers) to CSV text

export const CSV_SEPARATOR = ';';

// A column as configured by the user inside the export drawer.
// Field columns reference a data field by key; constant columns emit a fixed value on every row.
export interface ConfiguredColumn {
  uid: string;
  type: 'field' | 'constant';
  // key of the data field (field columns only)
  fieldKey?: string;
  // custom header; empty string means "use the field's default label"
  header: string;
  // constant value (constant columns only)
  value?: string;
}

// Escape a single CSV cell: quote when it contains the separator, quotes or line breaks
export function escapeCsvValue(value: string): string {
  if (/["\n\r]/.test(value) || value.includes(CSV_SEPARATOR)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface CsvColumnResolved {
  header: string;
  getValue: (rowIndex: number) => string;
}

export function buildCsv(columns: CsvColumnResolved[], rowCount: number): string {
  const lines = [columns.map((col) => escapeCsvValue(col.header)).join(CSV_SEPARATOR)];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    lines.push(columns.map((col) => escapeCsvValue(col.getValue(rowIndex))).join(CSV_SEPARATOR));
  }
  return lines.join('\n');
}
