import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { isReadOnlyDatabaseError } from '../database/persistence-errors';

/**
 * Adds actionable storage guidance to the log when the database refuses writes because its storage is read-only (the
 * active backend classifies the failure). The response is left to the default handling.
 */
@Catch()
export class PersistenceReadOnlyFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PersistenceReadOnlyFilter.name);

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (isReadOnlyDatabaseError(exception)) {
      this.logger.error(
        'The database is read-only. If you upgraded from a root-based container, ' +
          'fix storage ownership by running as root: chown -R appuser:appuser /app/storage',
      );
    }

    super.catch(exception, host);
  }
}
