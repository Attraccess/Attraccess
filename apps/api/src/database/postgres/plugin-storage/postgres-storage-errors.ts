import type { PersistenceErrorClassifier, PersistenceErrorKind } from '../../persistence-errors';

/** The SQLSTATE of a driver error (`QueryFailedError.driverError.code`, or `code` of a raw pg error). */
export function postgresSqlState(error: unknown): string | undefined {
  const candidates = [
    (error as { driverError?: { code?: unknown } })?.driverError?.code,
    (error as { code?: unknown })?.code,
  ];
  return candidates.find((code): code is string => typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code));
}

/**
 * Interprets PostgreSQL SQLSTATEs as neutral persistence error categories: 23505 unique, 23503 foreign key, 40001
 * serialization failure and 40P01 deadlock (conflict), 55P03 lock not available and 57014 query canceled by a
 * statement timeout (busy), 25006 read-only transaction.
 */
export const postgresPluginErrorClassifier: PersistenceErrorClassifier = {
  classify(error: unknown): PersistenceErrorKind | undefined {
    switch (postgresSqlState(error)) {
      case '23505':
        return 'unique-violation';
      case '23503':
        return 'foreign-key-violation';
      case '40001':
      case '40P01':
        return 'conflict';
      case '55P03':
      case '57014':
        return 'busy';
      case '25006':
        return 'read-only';
      default:
        return undefined;
    }
  },
  diagnosticCode: postgresSqlState,
};
