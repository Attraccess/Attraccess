import { ForbiddenException } from '@nestjs/common';

// The message is a wire contract: the frontend keys its api-errors translations off it, and
// login.rate-limit.guard maps it to the `email_not_verified` audit reason.
export class UserEmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super('UserEmailNotVerifiedException');
  }
}
