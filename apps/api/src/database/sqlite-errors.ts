import { Logger, ServiceUnavailableException } from '@nestjs/common';

export const DATABASE_BUSY_MESSAGE = 'The database is busy; try again shortly';
const WARNING_INTERVAL_MS = 60_000;

const logger = new Logger('DatabaseBusy');
let lastWarningAt = Number.NEGATIVE_INFINITY;

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

/**
 * A statement gave up waiting: for another connection's write lock, or for another flow's transaction. better-sqlite3
 * reports extended result codes (SQLITE_BUSY_RECOVERY, ...), so any SQLITE_BUSY code counts.
 */
export function isSqliteBusyError(error: unknown): boolean {
  return sqliteErrorCode(error)?.startsWith('SQLITE_BUSY') ?? false;
}

/** The 503 for a request whose database work gave up waiting. Warns at most once a minute, so bursts do not flood. */
export function databaseBusyException(): ServiceUnavailableException {
  const now = Date.now();
  if (now - lastWarningAt >= WARNING_INTERVAL_MS) {
    lastWarningAt = now;
    logger.warn('Answering 503, the database stayed busy past its timeout; repeats within a minute are not logged');
  }
  return new ServiceUnavailableException(DATABASE_BUSY_MESSAGE);
}
