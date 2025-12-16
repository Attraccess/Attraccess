import { ForbiddenException } from '@nestjs/common';

export class LocalLoginForSSOForbiddenException extends ForbiddenException {
  constructor() {
    super('LOCAL_LOGIN_FOR_SSO_FORBIDDEN', {
      description: 'You cannot login with username and password for an SSO user. Please use the SSO provider to login.',
    });
  }
}
