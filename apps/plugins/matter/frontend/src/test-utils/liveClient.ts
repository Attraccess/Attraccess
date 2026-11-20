// A fake live-updates client for the host's `PluginLiveUpdatesProvider`: tests fire what the server would push.
import type { PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';

export interface FakeSubscription {
  topic: string;
  identifier?: string;
  onUpdate: (payload: unknown) => void;
  onReconnect?: () => void;
  onUnavailable?: () => void;
}

export function createFakeLiveClient() {
  const active = new Set<FakeSubscription>();
  const client: PluginLiveUpdatesClient = {
    subscribe(subscription, onUpdate, onReconnect, onUnavailable) {
      const entry: FakeSubscription = {
        topic: subscription.topic,
        identifier: subscription.identifier,
        onUpdate,
        onReconnect,
        onUnavailable,
      };
      active.add(entry);
      return () => active.delete(entry);
    },
  };
  const where = (topic: string, identifier?: string) =>
    [...active].filter(
      (entry) => entry.topic.endsWith(`:${topic}`) && (identifier === undefined || entry.identifier === identifier),
    );
  return {
    client,
    active,
    /** The server pushed a signal on the topic. */
    push: (topic: string, identifier?: string) =>
      where(topic, identifier).forEach((entry) => entry.onUpdate({ changed: true })),
    reconnect: (topic: string) => where(topic).forEach((entry) => entry.onReconnect?.()),
    unavailable: (topic: string) => where(topic).forEach((entry) => entry.onUnavailable?.()),
  };
}
