import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@attraccess/database-entities';
import type { AccountLockoutStore } from '../../../users-and-auth/rate-limiting/account-lockout.port';

/** Keeps the lockout state in the account row (lockedUntil, failedLoginAttempts, firstFailedLoginAt). */
@Injectable()
export class TypeOrmAccountLockoutStore implements AccountLockoutStore {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async recordFailureStreak(userId: number, streak: { failedAttempts: number; firstFailedAt: Date }): Promise<void> {
    await this.users.update(
      { id: userId },
      { failedLoginAttempts: streak.failedAttempts, firstFailedLoginAt: streak.firstFailedAt },
    );
  }

  async lockAccount(userId: number, lockedUntil: Date): Promise<void> {
    await this.users.update({ id: userId }, { lockedUntil, failedLoginAttempts: 0, firstFailedLoginAt: null });
  }

  async clearLockout(userId: number): Promise<void> {
    await this.users.update({ id: userId }, { lockedUntil: null, failedLoginAttempts: 0, firstFailedLoginAt: null });
  }
}
