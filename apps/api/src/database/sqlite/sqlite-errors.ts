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

/** Interprets SQLite driver errors as neutral persistence error categories. */
export const sqliteErrorClassifier: PersistenceErrorClassifier = {
  classify(error: unknown): PersistenceErrorKind | undefined {
    const code = sqliteErrorCode(error);
    if (!code) return undefined;
    if (code === 'SQLITE_BUSY') return 'busy';
    if (UNIQUE_CODES.has(code)) return 'unique-violation';
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return 'foreign-key-violation';
    if (code === 'SQLITE_BUSY_SNAPSHOT') return 'conflict';
    return undefined;
  },
  diagnosticCode: sqliteErrorCode,
};
