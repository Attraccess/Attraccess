import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Observable } from 'rxjs';

export type LiveTopicDefinition =
  | { topic: Extract<LiveSubscription, { resourceId: number }>['topic']; scope: 'resource' }
  | { topic: 'billing' | 'messaging' | 'notifications' | 'supervision'; scope: 'user' }
  | { topic: `plugin:${string}:${string}`; scope: 'plugin'; identifier: 'none' | 'required' | 'optional' };

/** Feature-owned adapter, registered during module initialization. */
export interface LiveTopicProvider {
  readonly topics: readonly LiveTopicDefinition[];
  /** Validate a whole set on every renewal; return rejection reasons by subscription key. */
  authorize?(
    subscriptions: readonly LiveSubscription[],
    user: AuthenticatedUser,
  ): ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;
  source(
    subscription: LiveSubscription,
    user: AuthenticatedUser,
  ): Observable<{ data: object }> | Promise<Observable<{ data: object }>>;
  /** Called for active topics on visibility controls, and with false on teardown. */
  setPresence?(subscription: LiveSubscription, userId: number, connectionId: string, present: boolean): void;
}
