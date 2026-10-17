import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { PASSWORD_POLICY_WRITES, PasswordPolicyPersistence } from './persistence/port';
import { passwordPolicyTransactionOperations, TypeormPasswordPolicyPersistence } from './persistence/typeorm-adapter';
import { Repository } from 'typeorm';
// NestJS module wiring the password policy entity, controller, and validation service
// FEATURE: Password policy core registration in DI graph

import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import {
  AuthenticationDetail,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
} from '@attraccess/database-entities';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordPolicyController } from './password-policy.controller';
import { AdminPasswordPolicyController } from './admin-password-policy.controller';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PasswordPolicy, PasswordPolicyOverride, PasswordHistory, AuthenticationDetail]),
    RbacModule,
  ],
  providers: [
    {
      provide: PasswordPolicyPersistence,
      useFactory: (
        driver: SqliteTransactionDriver,
        policies: Repository<PasswordPolicy>,
        overrides: Repository<PasswordPolicyOverride>,
        history: Repository<PasswordHistory>,
        auth: Repository<AuthenticationDetail>,
      ) => {
        driver.register(PASSWORD_POLICY_WRITES, passwordPolicyTransactionOperations);
        return new TypeormPasswordPolicyPersistence(policies, overrides, history, auth);
      },
      inject: [
        SqliteTransactionDriver,
        getRepositoryToken(PasswordPolicy),
        getRepositoryToken(PasswordPolicyOverride),
        getRepositoryToken(PasswordHistory),
        getRepositoryToken(AuthenticationDetail),
      ],
    },
    PasswordPolicyService,
    HibpClient,
    ZxcvbnService,
  ],
  controllers: [PasswordPolicyController, AdminPasswordPolicyController],
  exports: [PasswordPolicyService],
})
export class PasswordPolicyModule {}
