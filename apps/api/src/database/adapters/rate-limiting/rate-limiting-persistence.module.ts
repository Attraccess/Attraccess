import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { ACCOUNT_LOCKOUT_STORE } from '../../../users-and-auth/rate-limiting/account-lockout.port';
import { TypeOrmAccountLockoutStore } from './typeorm-account-lockout-store';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [TypeOrmAccountLockoutStore, { provide: ACCOUNT_LOCKOUT_STORE, useExisting: TypeOrmAccountLockoutStore }],
  exports: [ACCOUNT_LOCKOUT_STORE],
})
export class RateLimitingPersistenceModule {}
