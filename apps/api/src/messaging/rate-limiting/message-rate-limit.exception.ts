import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when a user exceeds the per-user messaging send/contact rate limit.
 * Maps to HTTP 429 Too Many Requests and carries the number of seconds the
 * client should wait before retrying.
 */
export class MessageRateLimitExceededException extends HttpException {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `You are sending messages too quickly. Please wait ${retryAfterSeconds} second(s) before trying again.`,
        error: 'MessageRateLimitExceeded',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
