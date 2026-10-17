import { Injectable } from '@nestjs/common';
import { NotificationPreference } from '@attraccess/application-models';
import { NotificationPersistence } from './persistence/port';
import {
  ALL_NOTIFICATION_CATEGORIES,
  DEFAULT_NOTIFICATION_CHANNELS,
  NotificationCategory,
  NotificationCategoryPreferences,
  NotificationChannel,
  NotificationChannelPreferences,
} from './notification-types';
import { NotificationPreferencesDto } from './dtos/notification-preferences.dto';
import { UpdateNotificationPreferencesDto } from './dtos/update-notification-preferences.dto';

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly persistence: NotificationPersistence) {}

  public async getPreferences(userId: number): Promise<NotificationPreferencesDto> {
    const row = await this.persistence.readPreferences(userId);
    return this.toDto(this.resolvePreferences(row));
  }

  public async updatePreferences(
    userId: number,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const existing = await this.persistence.readPreferences(userId);
    const preferences = this.resolvePreferences(existing);
    preferences[dto.category] = { ...preferences[dto.category], ...dto.channels };

    const serialized = JSON.stringify(preferences);
    const saved = await this.persistence.saveCategoryChannels(userId, serialized, existing);
    return this.toDto(this.resolvePreferences(saved));
  }

  public async isChannelEnabled(
    userId: number,
    category: NotificationCategory,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const row = await this.persistence.readPreferences(userId);
    return this.resolvePreferences(row)[category][channel];
  }

  private resolvePreferences(row: Partial<NotificationPreference> | null): NotificationCategoryPreferences {
    const preferences = this.cloneDefaults();
    const parsed = this.parseCategoryChannels(row?.categoryChannels);

    for (const category of ALL_NOTIFICATION_CATEGORIES) {
      preferences[category] = { ...preferences[category], ...parsed[category] };
    }

    if (!parsed[NotificationCategory.MESSAGES]) {
      if (typeof row?.messagesEmailOnOffline === 'boolean') {
        preferences[NotificationCategory.MESSAGES].email = row.messagesEmailOnOffline;
      }
      if (typeof row?.messagesPushEnabled === 'boolean') {
        preferences[NotificationCategory.MESSAGES].push = row.messagesPushEnabled;
      }
    }

    return preferences;
  }

  private parseCategoryChannels(value: string | null | undefined): Partial<NotificationCategoryPreferences> {
    if (!value) {
      return {};
    }

    try {
      return JSON.parse(value) as Partial<NotificationCategoryPreferences>;
    } catch {
      return {};
    }
  }

  private cloneDefaults(): NotificationCategoryPreferences {
    return Object.fromEntries(
      ALL_NOTIFICATION_CATEGORIES.map((category) => [category, { ...DEFAULT_NOTIFICATION_CHANNELS[category] }]),
    ) as NotificationCategoryPreferences;
  }

  private toDto(preferences: NotificationCategoryPreferences): NotificationPreferencesDto {
    return {
      categories: ALL_NOTIFICATION_CATEGORIES.map((category) => ({
        category,
        channels: preferences[category] as NotificationChannelPreferences,
      })),
    };
  }
}
