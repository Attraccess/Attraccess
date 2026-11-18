import {
  classifyPersistenceError,
  isDatabaseBusyError,
  isReadOnlyDatabaseError,
  isUniqueViolation,
  persistenceErrorCode,
  registerPersistenceErrorClassifier,
} from './persistence-errors';
import { postgresErrorClassifier } from './postgres/postgres-errors';

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
});
