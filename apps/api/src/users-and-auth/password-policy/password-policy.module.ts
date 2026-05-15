// NestJS module wiring the password policy entity, controller, and validation service
// FEATURE: Password policy core registration in DI graph

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordPolicy } from '@attraccess/database-entities';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordPolicyController } from './password-policy.controller';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';

@Module({
  imports: [TypeOrmModule.forFeature([PasswordPolicy])],
  providers: [PasswordPolicyService, HibpClient, ZxcvbnService],
  controllers: [PasswordPolicyController],
  exports: [PasswordPolicyService],
})
export class PasswordPolicyModule {}
