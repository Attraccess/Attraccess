import { NotificationPreference } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPersistence } from './port';

@Injectable()
export class TypeormNotificationPersistence extends NotificationPersistence {
  constructor(
    @InjectRepository(NotificationPreference) private readonly preferences: Repository<NotificationPreference>,
  ) {
    super();
  }

  async readPreferences(userId: number): Promise<NotificationPreference | null> {
    const row = await this.preferences.findOne({ where: { userId } });
    return row ? { ...row } : null;
  }

  async saveCategoryChannels(
    userId: number,
    channels: string,
    existing: NotificationPreference | null,
  ): Promise<NotificationPreference> {
    const row = existing ?? this.preferences.create({ userId, categoryChannels: channels });
    row.categoryChannels = channels;
    return { ...(await this.preferences.save(row)) };
  }
}
