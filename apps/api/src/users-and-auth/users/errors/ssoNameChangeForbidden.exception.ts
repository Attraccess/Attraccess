import { ForbiddenException } from '@nestjs/common';

export class SSONameChangeForbiddenException extends ForbiddenException {
  constructor() {
    super('SSO_NAME_CHANGE_FORBIDDEN', {
      description: 'You cannot change the name of an SSO user; the identity provider manages it',
    });
  }
}
