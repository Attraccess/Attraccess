import { User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import { EmailRecipientPersistence } from './port';

@Injectable()
export class TypeormEmailRecipientPersistence extends EmailRecipientPersistence {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {
    super();
  }
  async user(id: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOne({ where: { id } }));
  }
}
