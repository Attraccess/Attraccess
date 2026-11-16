/** A browser's web push subscription, as stored. */
export interface PushSubscriptionRecord {
  id: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
}

/** What a client sends to (re)subscribe a browser. */
export interface PushSubscriptionInput {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}
