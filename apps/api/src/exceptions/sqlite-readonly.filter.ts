import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { persistenceErrorCode } from '../database/persistence-errors';

/** A failed database statement as drivers report it: the driver's own error sits in `driverError`. */
function driverMessage(exception: unknown): string | undefined {
  const failure = exception as { driverError?: { message?: string }; message?: string } | null;
  if (!failure || typeof failure !== 'object' || !('driverError' in failure)) return undefined;
  return failure.driverError?.message ?? failure.message;
}

@Catch()
export class SqliteReadonlyFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SqliteReadonlyFilter.name);

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const message = driverMessage(exception);
    if (persistenceErrorCode(exception) === 'SQLITE_READONLY' || message?.includes('SQLITE_READONLY')) {
      this.logger.error(
        'SQLite database is read-only. If you upgraded from a root-based container, ' +
          'fix storage ownership by running as root: chown -R appuser:appuser /app/storage',
      );
    }

    super.catch(exception, host);
  }
}
