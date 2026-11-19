import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { classifyPersistenceError, databaseBusyException, persistenceErrorCode } from '../database/persistence-errors';

/** The answer to a value the database rejected. Never the driver message: it can quote the statement or its values. */
export const INVALID_DATABASE_INPUT_MESSAGE = 'A value in the request is not valid';

const logger = new Logger('PersistenceErrorFilter');

/**
 * The HTTP answer for a database failure the active backend classified, or undefined to leave it to default handling:
 * busy or conflicting (the database gave up waiting, the pool stayed exhausted, a retried conflict persisted) answers
 * 503 through `databaseBusyException` (one warning a minute); a value the column type rejected (out of range, malformed,
 * a NUL byte) answers 400 with a generic message.
 */
export function persistenceHttpException(exception: unknown): HttpException | undefined {
  if (exception instanceof HttpException) return undefined;
  switch (classifyPersistenceError(exception)) {
    case 'busy':
    case 'conflict':
      return databaseBusyException();
    case 'invalid-input':
      // A warning, not debug: the value can also come from the server itself (a bug), and that must stay visible.
      logger.warn(`Answering 400, the database rejected a value (${persistenceErrorCode(exception) ?? 'no code'})`);
      return new BadRequestException(INVALID_DATABASE_INPUT_MESSAGE);
    default:
      return undefined;
  }
}

/** Translates classified database failures (see persistenceHttpException); everything else goes to `next` unchanged. */
@Catch()
export class PersistenceErrorFilter implements ExceptionFilter {
  constructor(private readonly next: ExceptionFilter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    return this.next.catch(persistenceHttpException(exception) ?? exception, host);
  }
}
