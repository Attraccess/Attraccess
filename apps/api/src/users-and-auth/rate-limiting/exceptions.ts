import { HttpException, HttpStatus } from '@nestjs/common';

export class TooManyAuthAttemptsException extends HttpException {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'TooManyAuthAttempts',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AccountLockedException extends HttpException {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.LOCKED,
        message: 'AccountLocked',
        retryAfterSeconds,
      },
      HttpStatus.LOCKED,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
