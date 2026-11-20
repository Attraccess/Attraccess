import {
  classifyPersistenceError,
  isDatabaseBusyError,
  isInvalidInputError,
  isReadOnlyDatabaseError,
  isSafeToRetry,
  isUniqueViolation,
  persistenceErrorCode,
  registerPersistenceErrorClassifier,
} from './persistence-errors';
import { POOL_ACQUIRE_TIMEOUT_MESSAGE, postgresErrorClassifier } from './postgres/postgres-errors';

describe('persistence error categories', () => {
  beforeAll(() => registerPersistenceErrorClassifier(postgresErrorClassifier));

  it('maps SQLSTATEs on the error and on the driver error to neutral categories', () => {
    expect(classifyPersistenceError(Object.assign(new Error('x'), { code: '55P03' }))).toBe('busy');
    expect(isDatabaseBusyError({ driverError: { code: '57014' } })).toBe(true);
    expect(isUniqueViolation({ driverError: { code: '23505' } })).toBe(true);
    expect(classifyPersistenceError({ code: '23503' })).toBe('foreign-key-violation');
    expect(classifyPersistenceError({ code: '40001' })).toBe('conflict');
    expect(classifyPersistenceError({ code: '40P01' })).toBe('conflict');
    expect(classifyPersistenceError({ code: '08006' })).toBe('busy');
    expect(classifyPersistenceError({ code: '23502' })).toBeUndefined();
  });

  it('classifies a read-only transaction by code', () => {
    expect(classifyPersistenceError({ code: '25006' })).toBe('read-only');
    expect(isReadOnlyDatabaseError({ driverError: { code: '25006' } })).toBe(true);
    expect(isReadOnlyDatabaseError(new Error('read-only transaction in an unrelated message'))).toBe(false);
  });

  it('does not treat unrelated errors as database errors and exposes only a safe code', () => {
    expect(classifyPersistenceError(new Error('55P03 in the message only'))).toBeUndefined();
    expect(isDatabaseBusyError(undefined)).toBe(false);
    expect(persistenceErrorCode({ code: '55P03', message: 'secret parameter' })).toBe('55P03');
    expect(persistenceErrorCode(new Error('nothing'))).toBeUndefined();
  });

  it('classifies values the column type rejects as invalid input', () => {
    for (const code of ['22003', '22P02', '22021', '22P05', '22007', '22008']) {
      expect(classifyPersistenceError({ code })).toBe('invalid-input');
      expect(isInvalidInputError({ driverError: { code } })).toBe(true);
    }
    expect(isInvalidInputError({ code: '22001' })).toBe(false);
  });

  it('classifies an exhausted connection pool as busy by its exact pg-pool message only', () => {
    expect(classifyPersistenceError(new Error(POOL_ACQUIRE_TIMEOUT_MESSAGE))).toBe('busy');
    expect(isDatabaseBusyError({ driverError: new Error(POOL_ACQUIRE_TIMEOUT_MESSAGE) })).toBe(true);
    expect(classifyPersistenceError(new Error(`${POOL_ACQUIRE_TIMEOUT_MESSAGE} (and more)`))).toBeUndefined();
    expect(classifyPersistenceError({ message: POOL_ACQUIRE_TIMEOUT_MESSAGE })).toBeUndefined();
  });

  it('reports only failures that left nothing behind as safe to retry', () => {
    for (const code of ['40001', '40P01', '55P03', '57014']) {
      expect(isSafeToRetry({ code })).toBe(true);
      expect(isSafeToRetry({ driverError: { code } })).toBe(true);
    }
    for (const code of ['08006', '08003', '08000', '57P01', '53300', '23505', '25006', '22003']) {
      expect(isSafeToRetry({ code })).toBe(false);
    }
    expect(isSafeToRetry(new Error(POOL_ACQUIRE_TIMEOUT_MESSAGE))).toBe(false);
    expect(isSafeToRetry(undefined)).toBe(false);
  });
});
