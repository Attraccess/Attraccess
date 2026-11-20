import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { isReadOnlyDatabaseError } from '../database/persistence-errors';

/**
 * Adds actionable guidance to the log when the database refuses writes because it is read-only (the active backend
 * classifies the failure, e.g. PostgreSQL 25006 on a replica or a read-only transaction mode). The response is left to
 * the default handling.
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
        'The database refused a write because it is read-only. DATABASE_URL must point at the primary PostgreSQL ' +
          'server (not a replica), and the database user must not be restricted to read-only transactions.',
      );
    }

    super.catch(exception, host);
  }
}
