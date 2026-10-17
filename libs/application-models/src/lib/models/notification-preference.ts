import { User } from './user';

export interface NotificationPreference {
  id: number;
  userId: number;
  messagesEmailOnOffline: boolean;
  messagesPushEnabled: boolean;
  categoryChannels: string | null;
  user: User;
}
