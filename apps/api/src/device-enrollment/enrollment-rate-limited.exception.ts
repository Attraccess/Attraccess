import { HttpException, HttpStatus } from '@nestjs/common';

/** An approver typed too many wrong enrollment codes. Maps to HTTP 429 with the seconds to wait. */
export class EnrollmentRateLimitedException extends HttpException {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'EnrollmentRateLimited',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
