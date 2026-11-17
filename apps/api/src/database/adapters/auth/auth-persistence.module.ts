import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApiToken,
  ApiTokenPermission,
  AuthenticationDetail,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
} from '@attraccess/database-entities';
import { API_TOKEN_STORE } from '../../../users-and-auth/auth/api-token/api-token.port';
import { CREDENTIAL_STORE, TOTP_STORE } from '../../../users-and-auth/auth/credentials/credential-store.port';
import { PASSWORD_POLICY_STORE } from '../../../users-and-auth/password-policy/password-policy-store.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmApiTokenStore } from './typeorm-api-token.store';
import { TypeOrmCredentialStore } from './typeorm-credential.store';
import { TypeOrmPasswordPolicyStore } from './typeorm-password-policy.store';
import { TypeOrmTotpStore } from './typeorm-totp.store';

/** API tokens, password and single sign-on credentials, authenticator enrollments and the password policy. */
@Module({
  imports: [
    UnitOfWorkModule,
    TypeOrmModule.forFeature([
      ApiToken,
      ApiTokenPermission,
      AuthenticationDetail,
      PasswordHistory,
      PasswordPolicy,
      PasswordPolicyOverride,
    ]),
  ],
  providers: [
    { provide: API_TOKEN_STORE, useClass: TypeOrmApiTokenStore },
    { provide: CREDENTIAL_STORE, useClass: TypeOrmCredentialStore },
    { provide: TOTP_STORE, useClass: TypeOrmTotpStore },
    { provide: PASSWORD_POLICY_STORE, useClass: TypeOrmPasswordPolicyStore },
  ],
  exports: [API_TOKEN_STORE, CREDENTIAL_STORE, TOTP_STORE, PASSWORD_POLICY_STORE, UnitOfWorkModule],
})
export class AuthPersistenceModule {}
