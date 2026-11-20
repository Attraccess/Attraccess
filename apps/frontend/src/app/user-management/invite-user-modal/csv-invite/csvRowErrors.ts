export type CsvRowError = {
  row: number;
  field?: string;
  message: string;
  value?: string;
};

export const CSV_ROW_ERROR_REASON_KEYS: Record<string, string> = {
  DUPLICATE_IN_DB: 'DUPLICATE_IN_DB',
  DUPLICATE_IN_CSV: 'DUPLICATE_IN_CSV',
  REQUIRED: 'REQUIRED',
  INVALID: 'INVALID',
  'Row is empty': 'ROW_IS_EMPTY',
  'Invalid username format': 'INVALID_USERNAME_FORMAT',
  'Invalid username length': 'INVALID_USERNAME_LENGTH',
  NO_VALID_ROWS_FOUND_IN_CSV: 'NO_VALID_ROWS_FOUND_IN_CSV',
};

// Row 0 errors refer to the file itself: REQUIRED there means a mapped column is missing from the header.
const isMissingColumnError = (error: CsvRowError) => error.row === 0 && error.message === 'REQUIRED';

/** Translation key for a row error reason, or undefined to show the API message unchanged. */
export function getCsvRowErrorReasonKey(error: CsvRowError): string | undefined {
  if (isMissingColumnError(error)) return 'errors.reasons.COLUMN_MISSING';
  return Object.hasOwn(CSV_ROW_ERROR_REASON_KEYS, error.message)
    ? `errors.reasons.${CSV_ROW_ERROR_REASON_KEYS[error.message]}`
    : undefined;
}

/** Translation key for a row error field, or undefined to show the field (a CSV column name) unchanged. */
export function getCsvRowErrorFieldKey(error: CsvRowError): string | undefined {
  if (isMissingColumnError(error)) return undefined;
  return error.field === 'email' || error.field === 'username' ? `inputs.fieldMapping.${error.field}` : undefined;
}
