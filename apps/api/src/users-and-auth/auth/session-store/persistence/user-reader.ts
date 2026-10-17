import { User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { SessionUserReader } from '../session-store';

export class TypeormSessionUserReader implements SessionUserReader {
  constructor(private readonly users: Repository<User>) {}

  async findById(id: number) {
    const user = await this.users.findOne({ where: { id } });
    return user ? { ...user } : null;
  }
}
