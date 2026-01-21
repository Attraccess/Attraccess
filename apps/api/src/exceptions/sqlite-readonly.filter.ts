import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

@Catch()
export class SqliteReadonlyFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SqliteReadonlyFilter.name);

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof QueryFailedError) {
      const driverError = (exception as QueryFailedError & { driverError?: { code?: string; message?: string } })
        .driverError;
      const errorCode = driverError?.code;
      const errorMessage = driverError?.message ?? exception.message;

      if (errorCode === 'SQLITE_READONLY' || errorMessage?.includes('SQLITE_READONLY')) {
        this.logger.error(
          'SQLite database is read-only. If you upgraded from a root-based container, ' +
            'fix storage ownership by running as root: chown -R appuser:appuser /app/storage'
        );
      }
    }

    super.catch(exception, host);
  }
}
