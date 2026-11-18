import { PersistenceErrorClassifier, PersistenceErrorKind } from '../persistence-errors';

/** The SQLSTATE of a driver error (QueryFailedError.driverError.code, or the pg error itself). Safe to log. */
export function postgresErrorCode(error: unknown): string | undefined {
  const candidates = [
    (error as { code?: unknown })?.code,
    (error as { driverError?: { code?: unknown } })?.driverError?.code,
  ];
  return candidates.find((code): code is string => typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code));
}

/**
 * 40001 serialization failure and 40P01 deadlock: the transaction was rolled back and may be run again.
 * 55P03 lock not available and 57014 statement/lock timeout: the database gave up waiting.
 * 53300 too many connections, 08xxx connection failures and 57P0x admin shutdown are transient as well.
 */
export const postgresErrorClassifier: PersistenceErrorClassifier = {
  classify(error: unknown): PersistenceErrorKind | undefined {
    const code = postgresErrorCode(error);
    if (!code) return undefined;
    if (code === '40001' || code === '40P01') return 'conflict';
    if (code === '55P03' || code === '57014' || code === '53300' || code.startsWith('08') || code === '57P01') {
      return 'busy';
    }
    if (code === '23505') return 'unique-violation';
    if (code === '23503') return 'foreign-key-violation';
    if (code === '25006') return 'read-only';
    return undefined;
  },
  diagnosticCode: postgresErrorCode,
};
