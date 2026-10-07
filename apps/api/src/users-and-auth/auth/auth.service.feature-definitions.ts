import { AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import { UnauthorizedException } from '@nestjs/common';

export interface LocalPasswordAuthenticationOptions {
  password: string;
}

export interface SSOAuthenticationOptions {
  providerType: SSOProviderType;
  providerId: number;
  subject: string;
}

export type AuthenticationOptions =
  | {
      type: AuthenticationType.LOCAL_PASSWORD;
      details: LocalPasswordAuthenticationOptions;
    }
  | {
      type: AuthenticationType.SSO;
      details: SSOAuthenticationOptions;
    };
export class UserEmailInvalidVerificationTokenException extends UnauthorizedException {
  constructor() {
    super('UserEmailInvalidVerificationTokenException');
  }
}
export class UserEmailVerificationTokenExpiredException extends UnauthorizedException {
  constructor() {
    super('UserEmailVerificationTokenExpiredException');
  }
}
