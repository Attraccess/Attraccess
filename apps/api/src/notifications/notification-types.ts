export enum NotificationCategory {
  MESSAGES = 'messages',
  MAINTENANCE_REQUESTS = 'maintenance_requests',
  RESOURCE_USAGE_NOTES = 'resource_usage_notes',
  RESOURCE_HEALTH = 'resource_health',
  RESOURCE_TAKEOVER = 'resource_takeover',
  RESOURCE_SESSION_ENDED = 'resource_session_ended',
  PROJECT_INVITATIONS = 'project_invitations',
  SUPERVISION_REQUESTS = 'supervision_requests',
  ACCESS_CHANGES = 'access_changes',
  NFC_CARDS = 'nfc_cards',
}

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  TOAST = 'toast',
}

export type NotificationChannelPreferences = Record<NotificationChannel, boolean>;
export type NotificationCategoryPreferences = Record<NotificationCategory, NotificationChannelPreferences>;

export const ALL_NOTIFICATION_CATEGORIES = Object.values(NotificationCategory);

export const DEFAULT_NOTIFICATION_CHANNELS: NotificationCategoryPreferences = {
  [NotificationCategory.MESSAGES]: { email: true, push: true, toast: true },
  [NotificationCategory.MAINTENANCE_REQUESTS]: { email: true, push: true, toast: true },
  [NotificationCategory.RESOURCE_USAGE_NOTES]: { email: true, push: true, toast: true },
  [NotificationCategory.RESOURCE_HEALTH]: { email: true, push: true, toast: true },
  [NotificationCategory.RESOURCE_TAKEOVER]: { email: false, push: true, toast: true },
  [NotificationCategory.RESOURCE_SESSION_ENDED]: { email: false, push: true, toast: true },
  [NotificationCategory.PROJECT_INVITATIONS]: { email: true, push: true, toast: true },
  [NotificationCategory.SUPERVISION_REQUESTS]: { email: false, push: true, toast: true },
  [NotificationCategory.ACCESS_CHANGES]: { email: false, push: true, toast: true },
  [NotificationCategory.NFC_CARDS]: { email: false, push: true, toast: true },
};
