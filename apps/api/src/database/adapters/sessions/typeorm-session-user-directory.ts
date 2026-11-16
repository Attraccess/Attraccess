import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@attraccess/database-entities';
import type { AuthenticatedSessionUser } from '@attraccess/application-models';
import type { SessionUserDirectory } from '../../../users-and-auth/auth/session-store/session-user-directory.port';

@Injectable()
export class TypeOrmSessionUserDirectory implements SessionUserDirectory {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findSessionUser(userId: number): Promise<AuthenticatedSessionUser | null> {
    return this.users.findOne({ where: { id: userId } });
  }
}
