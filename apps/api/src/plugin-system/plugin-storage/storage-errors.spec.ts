import {
  PluginStorageConflict,
  PluginStorageError,
  PluginStorageInvalid,
  PluginStorageUniqueViolation,
} from '@attraccess/plugins-backend-sdk';
import { registerPersistenceErrorClassifier } from '../../database/persistence-errors';
import { postgresErrorClassifier } from '../../database/postgres/postgres-errors';
import { mapStorageError } from './storage-errors';

/** A failed statement as TypeORM reports it: it carries the statement, its parameters and the driver error. */
const driverFailure = (code: string, message: string) =>
  Object.assign(new Error(message), {
    name: 'QueryFailedError',
    query: 'INSERT INTO "plugin_x_items" ("secret") VALUES ($1)',
    parameters: ['another user data'],
    driverError: Object.assign(new Error(message), { code }),
  });

describe('mapStorageError', () => {
  beforeAll(() => registerPersistenceErrorClassifier(postgresErrorClassifier));

  it.each([
    [
      'a unique key',
      driverFailure('23505', 'duplicate key value violates unique constraint "plugin_x_items_name_key"'),
      PluginStorageUniqueViolation,
    ],
    [
      'the primary key',
      driverFailure('23505', 'duplicate key value violates unique constraint "plugin_x_items_pkey"'),
      PluginStorageUniqueViolation,
    ],
    [
      'a serialization failure',
      Object.assign(new Error('could not serialize access'), { code: '40001' }),
      PluginStorageConflict,
    ],
    ['a deadlock', Object.assign(new Error('deadlock detected'), { code: '40P01' }), PluginStorageConflict],
    ['a foreign key', driverFailure('23503', 'violates foreign key constraint'), PluginStorageInvalid],
    [
      'any other driver failure',
      driverFailure('23502', 'null value in column "name" violates not-null constraint'),
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
