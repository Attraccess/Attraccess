import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Setting, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { SettingsReadContext, SettingsRows, SetupAccountStats } from '../../../settings/settings-rows.port';
import { TransactionHandles } from '../common/transaction-handles';

@Injectable()
export class TypeOrmSettingsRows implements SettingsRows {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    private readonly handles: TransactionHandles,
  ) {}

  /** For tests that bring their own database: no unit of work, a raw transaction handle is still accepted. */
  static forRepository(settings: Repository<Setting>): TypeOrmSettingsRows {
    return new TypeOrmSettingsRows(settings, new TransactionHandles(undefined as never));
  }

  async findValue(parent: string, key: string, context?: SettingsReadContext): Promise<string | null> {
    const manager = this.handles.managerOf(context);
    const repository = manager ? manager.getRepository(Setting) : this.settings;
    const row = await repository.findOneBy({ parent, key });
    return row?.value ?? null;
  }

  async upsertValue(parent: string, key: string, value: string): Promise<void> {
    const existing = await this.settings.findOneBy({ parent, key });
    if (existing) {
      await this.settings.update(existing.id, { value });
    } else {
      await this.settings.insert({ parent, key, value });
    }
  }

  async remove(parent: string, key: string): Promise<void> {
    await this.settings.delete({ parent, key });
  }
}

@Injectable()
export class TypeOrmSetupAccountStats implements SetupAccountStats {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  countAccounts(): Promise<number> {
    return this.users.count();
  }

  countVerifiedAccounts(): Promise<number> {
    return this.users.count({ where: { isEmailVerified: true } });
  }
}
