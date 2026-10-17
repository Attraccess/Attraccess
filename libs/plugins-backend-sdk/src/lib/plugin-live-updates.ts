import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from './auth.types';

export interface PluginLiveSubscription {
  /** Plugin-local topic name; the host adds the plugin namespace. */
  topic: string;
  identifier?: string;
}

export interface PluginLiveTopic<T extends object = object> {
  topic: string;
  identifier: 'none' | 'required' | 'optional';
  /** Required. Throw to reject. Runs on every subscription set/lease renewal. */
  authorize(subscription: PluginLiveSubscription, user: AuthenticatedUser): void | Promise<void>;
  /** Identity always comes from the authenticated session. Release sources on unsubscribe. */
  source(subscription: PluginLiveSubscription, user: AuthenticatedUser): Observable<{ data: T }>;
}

export interface PluginLiveUpdatesContext {
  /** Register during onModuleInit. Returns an idempotent unregister function. */
  register<T extends object>(definition: PluginLiveTopic<T>): () => void;
}
