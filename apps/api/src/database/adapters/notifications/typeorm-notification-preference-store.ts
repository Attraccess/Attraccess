import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationPreference } from '@attraccess/database-entities';
import { NotificationPreferenceRecord } from '@attraccess/application-models';
import { Repository } from 'typeorm';
import { NotificationPreferenceStore } from '../../../notifications/notification-preference-store.port';

const toRecord = (row: NotificationPreference): NotificationPreferenceRecord => ({
  userId: row.userId,
  messagesEmailOnOffline: row.messagesEmailOnOffline,
  messagesPushEnabled: row.messagesPushEnabled,
  categoryChannels: row.categoryChannels,
});

@Injectable()
export class TypeOrmNotificationPreferenceStore implements NotificationPreferenceStore {
  constructor(
    @InjectRepository(NotificationPreference) private readonly preferences: Repository<NotificationPreference>,
  ) {}

  async findForUser(userId: number): Promise<NotificationPreferenceRecord | null> {
    const row = await this.preferences.findOne({ where: { userId } });
    return row ? toRecord(row) : null;
  }

  async saveCategoryChannels(userId: number, categoryChannels: string): Promise<NotificationPreferenceRecord> {
    const existing = await this.preferences.findOne({ where: { userId } });
    const row = existing ?? this.preferences.create({ userId, categoryChannels });
    row.categoryChannels = categoryChannels;
    return toRecord(await this.preferences.save(row));
  }
}
