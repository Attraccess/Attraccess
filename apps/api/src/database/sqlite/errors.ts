import { QueryFailedError } from 'typeorm';
import { DatabaseErrors } from '../backend';

export class SqliteDatabaseErrors extends DatabaseErrors {
  readonly readOnlyGuidance =
    'SQLite database is read-only. If you upgraded from a root-based container, ' +
    'fix storage ownership by running as root: chown -R appuser:appuser /app/storage';

  isReadOnly(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; message?: string } | undefined;
    return (
      driverError?.code === 'SQLITE_READONLY' ||
      Boolean((driverError?.message ?? error.message)?.includes('SQLITE_READONLY'))
    );
  }
}
