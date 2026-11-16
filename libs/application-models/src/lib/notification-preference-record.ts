/** The stored notification choices of one user. `categoryChannels` is a JSON map of category to channels. */
export interface NotificationPreferenceRecord {
  userId: number;
  messagesEmailOnOffline: boolean;
  messagesPushEnabled: boolean;
  categoryChannels: string | null;
}
