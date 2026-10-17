import { User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateLimitPersistence } from './port';

@Injectable()
export class TypeormRateLimitPersistence extends RateLimitPersistence {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {
    super();
  }
  async recordFailureState(userId: number, attempts: number, firstAt: Date): Promise<void> {
    await this.users.update({ id: userId }, { failedLoginAttempts: attempts, firstFailedLoginAt: firstAt });
  }
  async lockAccount(userId: number, until: Date): Promise<void> {
    await this.users.update({ id: userId }, { lockedUntil: until, failedLoginAttempts: 0, firstFailedLoginAt: null });
  }
  async clearAccount(userId: number): Promise<void> {
    await this.users.update({ id: userId }, { lockedUntil: null, failedLoginAttempts: 0, firstFailedLoginAt: null });
  }
}
