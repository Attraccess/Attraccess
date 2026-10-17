import { Setting, User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsPersistence } from './port';

@Injectable()
export class TypeormSettingsPersistence extends SettingsPersistence {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }

  async read(parent: string, key: string): Promise<Setting | null> {
    const row = await this.settings.findOneBy({ parent, key });
    return row ? { ...row } : null;
  }

  async write(parent: string, key: string, value: string): Promise<void> {
    const existing = await this.settings.findOneBy({ parent, key });
    if (existing) {
      existing.value = value;
      await this.settings.save(existing);
    } else {
      await this.settings.save(this.settings.create({ parent, key, value }));
    }
  }

  async remove(parent: string, key: string): Promise<void> {
    await this.settings.delete({ parent, key });
  }

  countUsers(verifiedOnly = false): Promise<number> {
    return verifiedOnly ? this.users.count({ where: { isEmailVerified: true } }) : this.users.count();
  }
}
