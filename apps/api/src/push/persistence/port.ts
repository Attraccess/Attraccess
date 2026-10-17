import type { PushSubscription } from '@attraccess/application-models';

export interface SubscriptionRegistration {
  endpoint: string;
  userId: number;
  p256dh: string;
  auth: string;
  userAgent?: string;
  lastSeenAt: Date;
}

export abstract class PushPersistence {
  abstract countSubscriptions(): Promise<number>;
  abstract removeAllSubscriptions(): Promise<number>;
  abstract registerSubscription(input: SubscriptionRegistration): Promise<PushSubscription>;
  abstract removeOwnedSubscription(userId: number, endpoint: string): Promise<void>;
  abstract listUserSubscriptions(userId: number): Promise<PushSubscription[]>;
  abstract removeStaleSubscription(id: number): Promise<void>;
}
