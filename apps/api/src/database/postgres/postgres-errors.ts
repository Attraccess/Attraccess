import { PersistenceErrorClassifier, PersistenceErrorKind } from '../persistence-errors';

/** The SQLSTATE of a driver error (QueryFailedError.driverError.code, or the pg error itself). Safe to log. */
export function postgresErrorCode(error: unknown): string | undefined {
  const candidates = [
    (error as { code?: unknown })?.code,
    (error as { driverError?: { code?: unknown } })?.driverError?.code,
  ];
  return candidates.find((code): code is string => typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code));
}

/** The constraint (or index) a pg error names: on the driver error, or copied onto TypeORM's QueryFailedError. */
export function postgresConstraintName(error: unknown): string | undefined {
  const candidates = [
    (error as { driverError?: { constraint?: unknown } })?.driverError?.constraint,
    (error as { constraint?: unknown })?.constraint,
  ];
  return candidates.find((name): name is string => typeof name === 'string' && name.length > 0);
}

/**
 * What pg-pool rejects `connect()` with when every pooled connection stayed checked out past `connectionTimeoutMillis`
 * (TypeORM's `connectTimeoutMS`). It has no SQLSTATE; the message is pg-pool's own and contains nothing of the query.
 */
export const POOL_ACQUIRE_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect';

function isPoolAcquireTimeout(error: unknown): boolean {
  const candidates = [error, (error as { driverError?: unknown } | null | undefined)?.driverError];
  return candidates.some(
    (candidate) =>
      candidate instanceof Error &&
      candidate.message === POOL_ACQUIRE_TIMEOUT_MESSAGE &&
      (candidate as { code?: unknown }).code === undefined,
  );
}

/**
 * The failures after which PostgreSQL rolled the whole transaction back, so running it again cannot apply it twice:
 * 40001 serialization failure, 40P01 deadlock, 55P03 lock not available and 57014 statement/lock timeout.
 */
const SAFE_TO_RETRY = new Set(['40001', '40P01', '55P03', '57014']);

/**
 * 22003 numeric value out of range, 22P02 invalid text representation, 22021 character not in repertoire (a NUL
 * byte), 22P05 untranslatable character (`\u0000` in a jsonb string), 22007 invalid datetime format, 22008 datetime
 * field overflow: a value the request supplied that the column type cannot hold.
 */
const INVALID_INPUT = new Set(['22003', '22P02', '22021', '22P05', '22007', '22008']);

/**
 * 40001 serialization failure and 40P01 deadlock: the transaction was rolled back and may be run again.
 * 55P03 lock not available and 57014 statement/lock timeout: the database gave up waiting.
 * 53300 too many connections, 08xxx connection failures, 57P01 admin shutdown and an exhausted pool (no connection
 * free within the acquire timeout) are busy as well, but not safe to retry automatically: a COMMIT whose connection
 * dropped may have committed.
 */
export const postgresErrorClassifier: PersistenceErrorClassifier = {
  classify(error: unknown): PersistenceErrorKind | undefined {
    const code = postgresErrorCode(error);
    if (!code) return isPoolAcquireTimeout(error) ? 'busy' : undefined;
    if (code === '40001' || code === '40P01') return 'conflict';
    if (code === '55P03' || code === '57014' || code === '53300' || code.startsWith('08') || code === '57P01') {
      return 'busy';
    }
    if (code === '23505') return 'unique-violation';
    if (code === '23503') return 'foreign-key-violation';
    if (code === '25006') return 'read-only';
    if (INVALID_INPUT.has(code)) return 'invalid-input';
    return undefined;
  },
  diagnosticCode: postgresErrorCode,
  constraintName: postgresConstraintName,
  isSafeToRetry(error: unknown): boolean {
    const code = postgresErrorCode(error);
    return code !== undefined && SAFE_TO_RETRY.has(code);
  },
};
