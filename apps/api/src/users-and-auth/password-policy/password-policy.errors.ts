// HTTP exception carrying structured policy error list for clients to render localized messages
// FEATURE: Password policy register-flow rejection contract

import { BadRequestException } from '@nestjs/common';
import { PolicyError } from '@attraccess/shared';

export class PasswordPolicyViolationException extends BadRequestException {
  constructor(public readonly policyErrors: PolicyError[]) {
    super({
      error: 'PasswordPolicyViolation',
      message: 'Password does not meet policy requirements',
      policyErrors,
    });
  }
}
