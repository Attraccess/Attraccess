import { Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Backend-neutral categories of a failed database operation. Application code reacts to these; the active backend
 * adapter owns the mapping from driver error codes (see registerPersistenceErrorClassifier).
 */
export type PersistenceErrorKind =
  /** The database gave up waiting for a lock or another transaction: retry later, answer 503. */
  | 'busy'
  /** Two concurrent writers conflicted (serialization failure, deadlock). The operation may be retried. */
  | 'conflict'
  /** A unique or primary key constraint rejected the write. */
  | 'unique-violation'
  /** A foreign key constraint rejected the write. */
  | 'foreign-key-violation'
  /** The database refused to write: its storage is read-only (for example wrong file ownership after an upgrade). */
  | 'read-only';

export interface PersistenceErrorClassifier {
  /** The neutral category of a driver error, or undefined when the adapter does not recognise it. */
  classify(error: unknown): PersistenceErrorKind | undefined;
  /** A driver result code that is safe to log (never the driver message: it may contain SQL parameters). */
  diagnosticCode(error: unknown): string | undefined;
}

export const DATABASE_BUSY_MESSAGE = 'The database is busy; try again shortly';
const WARNING_INTERVAL_MS = 60_000;

const logger = new Logger('DatabaseBusy');
const classifiers = new Set<PersistenceErrorClassifier>();
let lastWarningAt = Number.NEGATIVE_INFINITY;

/** Called by a backend adapter when it is selected. Registering the same classifier twice is a no-op. */
export function registerPersistenceErrorClassifier(classifier: PersistenceErrorClassifier): void {
  classifiers.add(classifier);
}

export function classifyPersistenceError(error: unknown): PersistenceErrorKind | undefined {
  for (const classifier of classifiers) {
    const kind = classifier.classify(error);
    if (kind) return kind;
  }
  return undefined;
}

export function persistenceErrorCode(error: unknown): string | undefined {
  for (const classifier of classifiers) {
    const code = classifier.diagnosticCode(error);
    if (code) return code;
  }
  return undefined;
}

export const isDatabaseBusyError = (error: unknown): boolean => classifyPersistenceError(error) === 'busy';
export const isUniqueViolation = (error: unknown): boolean => classifyPersistenceError(error) === 'unique-violation';
export const isWriteConflict = (error: unknown): boolean => classifyPersistenceError(error) === 'conflict';
export const isReadOnlyDatabaseError = (error: unknown): boolean => classifyPersistenceError(error) === 'read-only';

/** The 503 for a request whose database work gave up waiting. Warns at most once a minute, so bursts do not flood. */
export function databaseBusyException(): ServiceUnavailableException {
  const now = Date.now();
  if (now - lastWarningAt >= WARNING_INTERVAL_MS) {
    lastWarningAt = now;
    logger.warn('Answering 503, the database stayed busy past its timeout; repeats within a minute are not logged');
  }
  return new ServiceUnavailableException(DATABASE_BUSY_MESSAGE);
}
