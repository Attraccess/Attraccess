import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@attraccess/database-entities';
import type { AuthenticatedSessionUser } from '@attraccess/application-models';
import type { SessionUserDirectory } from '../../../users-and-auth/auth/session-store/session-user-directory.port';
import { toUserRecord } from '../users/user-mapping';

/**
 * Maps the account row to the neutral session user: a plain object with exactly the account columns, never the
 * entity instance (no relations, no class-transformer metadata). Responses map it to a DTO before sending it.
 */
export function toAuthenticatedSessionUser(user: User): AuthenticatedSessionUser {
  return toUserRecord(user);
}

@Injectable()
export class TypeOrmSessionUserDirectory implements SessionUserDirectory {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async findSessionUser(userId: number): Promise<AuthenticatedSessionUser | null> {
    const user = await this.users.findOne({ where: { id: userId } });
    return user ? toAuthenticatedSessionUser(user) : null;
  }
}
