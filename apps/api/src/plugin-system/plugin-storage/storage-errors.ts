import {
  PluginStorageConflict,
  PluginStorageError,
  PluginStorageInvalid,
  PluginStorageUniqueViolation,
} from '@attraccess/plugins-backend-sdk';
import { classifyPersistenceError, persistenceErrorCode } from '../../database/persistence-errors';

/** A driver failure: it carries the engine's error (and with it the statement and its parameters). */
function isDriverFailure(error: unknown): boolean {
  const failure = error as { name?: unknown; driverError?: unknown; query?: unknown } | null;
  return failure?.name === 'QueryFailedError' || (typeof failure === 'object' && failure !== null && 'driverError' in failure);
}

/**
 * Maps a failure of a storage statement to the neutral storage errors a plugin may catch. The plugin never sees the
 * engine's error: it names the statement and parameters, which may hold other users' data. Errors that are not
 * driver failures (a closed scope, a misuse caught by the host) pass through unchanged.
 */
export function mapStorageError(error: unknown): unknown {
  if (error instanceof PluginStorageError) return error;
  switch (classifyPersistenceError(error)) {
    case 'unique-violation':
      return new PluginStorageUniqueViolation();
    case 'busy':
    case 'conflict':
      return new PluginStorageConflict();
    case 'foreign-key-violation':
      return new PluginStorageInvalid('A foreign key constraint rejected the write.');
    case 'read-only':
      return new PluginStorageError('The storage is read-only.', 'REFUSED');
    default:
      break;
  }
  if (!isDriverFailure(error)) return error;
  const code = persistenceErrorCode(error);
  return new PluginStorageInvalid(`The storage operation failed${code ? ` (${code})` : ''}.`);
}
