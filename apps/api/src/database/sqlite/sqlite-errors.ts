import { PersistenceErrorClassifier, PersistenceErrorKind } from '../persistence-errors';

/**
 * The SQLite result code of a driver error (QueryFailedError.driverError.code) or of the connection guard's own busy
 * error (error.code). Only this code is safe to log; the driver message may contain SQL parameters.
 */
export function sqliteErrorCode(error: unknown): string | undefined {
  const candidates = [
    (error as { code?: unknown })?.code,
    (error as { driverError?: { code?: unknown } })?.driverError?.code,
  ];
  return candidates.find((code): code is string => typeof code === 'string' && /^SQLITE_[A-Z_]+$/.test(code));
}

/** A statement gave up waiting: for another connection's write lock, or for another flow's transaction. */
export function isSqliteBusyError(error: unknown): boolean {
  return sqliteErrorCode(error) === 'SQLITE_BUSY';
}

const UNIQUE_CODES = new Set(['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY']);

/**
 * The node sqlite3 driver reports constraint failures with the generic code SQLITE_CONSTRAINT and names the kind
 * only in its message. The message is read for classification and never logged (it can contain column values).
 */
function constraintKind(error: unknown): PersistenceErrorKind | undefined {
  const messages = [
    (error as { message?: unknown })?.message,
    (error as { driverError?: { message?: unknown } })?.driverError?.message,
  ].filter((message): message is string => typeof message === 'string');
  if (messages.some((message) => /UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(message))) {
    return 'unique-violation';
  }
  if (messages.some((message) => /FOREIGN KEY constraint failed/i.test(message))) return 'foreign-key-violation';
  return undefined;
}

/**
 * A failed statement (it carries the driver's error in `driverError`) whose driver message names SQLITE_READONLY,
 * for drivers that report the condition without the code. Read for classification only, never logged.
 */
function readOnlyByMessage(error: unknown): boolean {
  const failure = error as { driverError?: { message?: unknown }; message?: unknown } | null;
  if (!failure || typeof failure !== 'object' || !('driverError' in failure)) return false;
  const message = failure.driverError?.message ?? failure.message;
  return typeof message === 'string' && message.includes('SQLITE_READONLY');
}

/** Interprets SQLite driver errors as neutral persistence error categories. */
export const sqliteErrorClassifier: PersistenceErrorClassifier = {
  classify(error: unknown): PersistenceErrorKind | undefined {
    const code = sqliteErrorCode(error);
    if (!code) return readOnlyByMessage(error) ? 'read-only' : undefined;
    if (code === 'SQLITE_BUSY') return 'busy';
    // SQLITE_READONLY and its extended codes (SQLITE_READONLY_DBMOVED, ...).
    if (code.startsWith('SQLITE_READONLY')) return 'read-only';
    if (UNIQUE_CODES.has(code)) return 'unique-violation';
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return 'foreign-key-violation';
    if (code === 'SQLITE_BUSY_SNAPSHOT') return 'conflict';
    if (code === 'SQLITE_CONSTRAINT') return constraintKind(error);
    return undefined;
  },
  diagnosticCode: sqliteErrorCode,
};
