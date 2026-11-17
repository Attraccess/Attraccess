import {
  classifyPersistenceError,
  isDatabaseBusyError,
  isReadOnlyDatabaseError,
  isUniqueViolation,
  persistenceErrorCode,
  registerPersistenceErrorClassifier,
} from './persistence-errors';
import { sqliteErrorClassifier } from './sqlite/sqlite-errors';

describe('persistence error categories', () => {
  beforeAll(() => registerPersistenceErrorClassifier(sqliteErrorClassifier));

  it('maps SQLite codes on the error and on the driver error to neutral categories', () => {
    expect(classifyPersistenceError(Object.assign(new Error('x'), { code: 'SQLITE_BUSY' }))).toBe('busy');
    expect(isDatabaseBusyError({ driverError: { code: 'SQLITE_BUSY' } })).toBe(true);
    expect(isUniqueViolation({ driverError: { code: 'SQLITE_CONSTRAINT_UNIQUE' } })).toBe(true);
    expect(classifyPersistenceError({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' })).toBe('unique-violation');
    expect(classifyPersistenceError({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe('foreign-key-violation');
    expect(classifyPersistenceError({ code: 'SQLITE_BUSY_SNAPSHOT' })).toBe('conflict');
    const generic = (message: string) => ({ code: 'SQLITE_CONSTRAINT', message });
    expect(classifyPersistenceError(generic('SQLITE_CONSTRAINT: UNIQUE constraint failed: t.k'))).toBe(
      'unique-violation',
    );
    expect(classifyPersistenceError(generic('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed'))).toBe(
      'foreign-key-violation',
    );
    expect(classifyPersistenceError(generic('SQLITE_CONSTRAINT: NOT NULL constraint failed: t.k'))).toBeUndefined();
  });

  it("classifies a read-only database by code, extended code or the failed statement's driver message", () => {
    expect(classifyPersistenceError({ code: 'SQLITE_READONLY' })).toBe('read-only');
    expect(isReadOnlyDatabaseError({ driverError: { code: 'SQLITE_READONLY_DBMOVED' } })).toBe(true);
    expect(isReadOnlyDatabaseError({ driverError: { message: 'SQLITE_READONLY: attempt to write' } })).toBe(true);
    // Only a failed statement (driverError) is read by message; any other error mentioning the code is not.
    expect(isReadOnlyDatabaseError(new Error('SQLITE_READONLY in an unrelated message'))).toBe(false);
  });

  it('does not treat unrelated errors as database errors and exposes only a safe code', () => {
    expect(classifyPersistenceError(new Error('SQLITE_BUSY in the message only'))).toBeUndefined();
    expect(isDatabaseBusyError(undefined)).toBe(false);
    expect(persistenceErrorCode({ code: 'SQLITE_BUSY', message: 'secret parameter' })).toBe('SQLITE_BUSY');
    expect(persistenceErrorCode(new Error('nothing'))).toBeUndefined();
  });
});
