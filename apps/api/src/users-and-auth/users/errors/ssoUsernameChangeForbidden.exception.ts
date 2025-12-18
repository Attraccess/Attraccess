import { ForbiddenException } from '@nestjs/common';

export class SSOUsernameChangeForbiddenException extends ForbiddenException {
  constructor() {
    super('SSO_USERNAME_CHANGE_FORBIDDEN', {
      description: 'You cannot change the username of an SSO user',
    });
  }
}
