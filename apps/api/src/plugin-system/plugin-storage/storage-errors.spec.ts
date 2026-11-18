import {
  PluginStorageConflict,
  PluginStorageError,
  PluginStorageInvalid,
  PluginStorageUniqueViolation,
} from '@attraccess/plugins-backend-sdk';
import { registerPersistenceErrorClassifier } from '../../database/persistence-errors';
import { sqliteErrorClassifier } from '../../database/sqlite/sqlite-errors';
import { mapStorageError } from './storage-errors';

/** A failed statement as TypeORM reports it: it carries the statement, its parameters and the driver error. */
const driverFailure = (code: string, message: string) =>
  Object.assign(new Error(message), {
    name: 'QueryFailedError',
    query: 'INSERT INTO "plugin_x_items" ("secret") VALUES (?)',
    parameters: ['another user data'],
    driverError: Object.assign(new Error(message), { code }),
  });

describe('mapStorageError', () => {
  beforeAll(() => registerPersistenceErrorClassifier(sqliteErrorClassifier));

  it.each([
    [
      'a unique key',
      driverFailure('SQLITE_CONSTRAINT', 'UNIQUE constraint failed: plugin_x_items.name'),
      PluginStorageUniqueViolation,
    ],
    ['the primary key', driverFailure('SQLITE_CONSTRAINT_PRIMARYKEY', 'x'), PluginStorageUniqueViolation],
    [
      'a busy database',
      Object.assign(new Error('SQLITE_BUSY: waited'), { code: 'SQLITE_BUSY' }),
      PluginStorageConflict,
    ],
    ['a foreign key', driverFailure('SQLITE_CONSTRAINT', 'FOREIGN KEY constraint failed'), PluginStorageInvalid],
    [
      'any other driver failure',
      driverFailure('SQLITE_CONSTRAINT', 'NOT NULL constraint failed: plugin_x_items.name'),
      PluginStorageInvalid,
    ],
  ])('maps %s to a neutral error that carries neither statement nor parameters', (_label, failure, expected) => {
    const mapped = mapStorageError(failure) as PluginStorageError;
    expect(mapped).toBeInstanceOf(expected);
    expect(mapped).toBeInstanceOf(PluginStorageError);
    expect(mapped.message).not.toMatch(/INSERT|another user data|plugin_x_items/);
    expect(Object.keys(mapped).sort()).toEqual(['code', 'name']);
  });

  it("keeps neutral errors and the host's own misuse errors as they are", () => {
    const neutral = new PluginStorageInvalid('bad');
    const misuse = new Error('The transaction scope is closed.');
    expect(mapStorageError(neutral)).toBe(neutral);
    expect(mapStorageError(misuse)).toBe(misuse);
  });
});
