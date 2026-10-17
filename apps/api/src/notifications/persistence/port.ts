import type { NotificationPreference } from '@attraccess/application-models';

export abstract class NotificationPersistence {
  abstract readPreferences(userId: number): Promise<NotificationPreference | null>;
  abstract saveCategoryChannels(
    userId: number,
    channels: string,
    existing: NotificationPreference | null,
  ): Promise<NotificationPreference>;
}
