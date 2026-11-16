import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { NotificationPreferenceRecord } from '@attraccess/application-models';
import { NOTIFICATION_PREFERENCE_STORE, NotificationPreferenceStore } from './notification-preference-store.port';
import {
  ALL_NOTIFICATION_CATEGORIES,
  AnyNotificationCategory,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_PLUGIN_NOTIFICATION_CHANNELS,
  NotificationCategory,
  NotificationCategoryPreferences,
  NotificationChannel,
  NotificationChannelPreferences,
} from './notification-types';
import { getPluginNotificationCategory, listPluginNotificationCategories } from './plugin-notification-categories';
import { NotificationPreferencesDto } from './dtos/notification-preferences.dto';
import { UpdateNotificationPreferencesDto } from './dtos/update-notification-preferences.dto';

@Injectable()
export class NotificationPreferenceService {
  constructor(
    @Inject(NOTIFICATION_PREFERENCE_STORE)
    private readonly store: NotificationPreferenceStore,
  ) {}

  public async getPreferences(userId: number): Promise<NotificationPreferencesDto> {
    const row = await this.store.findForUser(userId);
    return this.toDto(this.resolvePreferences(row));
  }

  public async updatePreferences(
    userId: number,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const existing = await this.store.findForUser(userId);
    const isCore = ALL_NOTIFICATION_CATEGORIES.includes(dto.category as NotificationCategory);
    if (!isCore && !getPluginNotificationCategory(dto.category)) {
      throw new BadRequestException(`Unknown notification category "${dto.category}"`);
    }
    const preferences = this.resolvePreferences(existing);
    preferences[dto.category] = { ...preferences[dto.category], ...dto.channels };

    const saved = await this.store.saveCategoryChannels(userId, JSON.stringify(preferences));
    return this.toDto(this.resolvePreferences(saved));
  }

  public async isChannelEnabled(
    userId: number,
    category: AnyNotificationCategory,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const row = await this.store.findForUser(userId);
    return (this.resolvePreferences(row)[category] ?? DEFAULT_PLUGIN_NOTIFICATION_CHANNELS)[channel];
  }

  private resolvePreferences(
    row: Partial<NotificationPreferenceRecord> | null,
  ): NotificationCategoryPreferences & Record<string, NotificationChannelPreferences> {
    const preferences: NotificationCategoryPreferences & Record<string, NotificationChannelPreferences> =
      this.cloneDefaults();
    const parsed = this.parseCategoryChannels(row?.categoryChannels) as Record<
      string,
      Partial<NotificationChannelPreferences> | undefined
    >;

    for (const category of ALL_NOTIFICATION_CATEGORIES) {
      preferences[category] = { ...preferences[category], ...parsed[category] };
    }
    // Plugin categories exist only while their plugin is loaded; stored choices for others are ignored.
    for (const { key } of listPluginNotificationCategories()) {
      preferences[key] = { ...DEFAULT_PLUGIN_NOTIFICATION_CHANNELS, ...parsed[key] };
    }
    // Keep choices of currently unloaded plugins so a save does not discard them.
    for (const key of Object.keys(parsed)) {
      if (key.startsWith('plugin.') && !preferences[key]) {
        preferences[key] = { ...DEFAULT_PLUGIN_NOTIFICATION_CHANNELS, ...parsed[key] };
      }
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

  private toDto(
    preferences: NotificationCategoryPreferences & Record<string, NotificationChannelPreferences>,
  ): NotificationPreferencesDto {
    return {
      pluginCategories: listPluginNotificationCategories().map(({ key, pluginName, label }) => ({
        category: key,
        pluginName,
        label,
        channels: preferences[key],
      })),
      categories: ALL_NOTIFICATION_CATEGORIES.map((category) => ({
        category,
        channels: preferences[category] as NotificationChannelPreferences,
      })),
    };
  }
}
