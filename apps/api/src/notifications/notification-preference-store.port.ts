import type { NotificationPreferenceRecord } from '@attraccess/application-models';

/** Persistence of each user's notification choices (one row per user). */
export const NOTIFICATION_PREFERENCE_STORE = Symbol.for('attraccess.notifications.preference-store');

export interface NotificationPreferenceStore {
  findForUser(userId: number): Promise<NotificationPreferenceRecord | null>;
  /** Creates the user's row or replaces its serialized category map, and returns the stored row. */
  saveCategoryChannels(userId: number, categoryChannels: string): Promise<NotificationPreferenceRecord>;
}
