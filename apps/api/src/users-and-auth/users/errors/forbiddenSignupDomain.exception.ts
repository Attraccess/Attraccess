import { ForbiddenException } from '@nestjs/common';

export class ForbiddenSignupDomainException extends ForbiddenException {
  constructor(public readonly domain: string) {
    super('ForbiddenSignupDomainException', {
      description: `Email domain "${domain}" not allowed for signup`,
    });
  }
}
