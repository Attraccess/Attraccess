import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { DatabaseErrors } from '../database/backend';

@Catch()
export class SqliteReadonlyFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SqliteReadonlyFilter.name);

  constructor(adapterHost: HttpAdapterHost, private readonly databaseErrors: DatabaseErrors) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (this.databaseErrors.isReadOnly(exception)) {
      this.logger.error(this.databaseErrors.readOnlyGuidance);
    }

    super.catch(exception, host);
  }
}
