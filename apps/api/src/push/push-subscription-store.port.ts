import type { PushSubscriptionInput, PushSubscriptionRecord } from '@attraccess/application-models';

/** Persistence of the web push subscriptions of all users. */
export const PUSH_SUBSCRIPTION_STORE = Symbol.for('attraccess.push.subscription-store');

export interface PushSubscriptionStore {
  count(): Promise<number>;
  /** Removes every subscription (they are bound to the VAPID key that is being replaced). */
  deleteAll(): Promise<void>;
  /**
   * Stores the subscription of a device. The endpoint identifies the device: re-subscribing (possibly as another user
   * on the same browser) replaces the existing entry. A missing user agent keeps the stored one.
   */
  upsertByEndpoint(input: PushSubscriptionInput): Promise<PushSubscriptionRecord>;
  findForUser(userId: number): Promise<PushSubscriptionRecord[]>;
  /** Removes the subscription of `userId` with this endpoint; another user's subscription stays. */
  deleteForUser(userId: number, endpoint: string): Promise<void>;
  deleteById(id: number): Promise<void>;
}
