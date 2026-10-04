/** One logical subscription on the tab's bundled live-update stream. */
export type LiveSubscription =
  | { topic: 'resource' | 'flow-logs'; resourceId: number }
  | { topic: 'billing' | 'messaging' | 'notifications' | 'supervision'; resourceId?: never; identifier?: never }
  | { topic: `plugin:${string}:${string}`; identifier?: string; resourceId?: never };

export type LiveTopic = LiveSubscription['topic'];
export type LiveEnvelope<T = unknown> = LiveSubscription & { eventType: string; payload: T };
export type LivePacket =
  | { type: 'event'; event: LiveEnvelope }
  | { type: 'ready' | 'heartbeat' }
  | { type: 'rejected'; subscription: unknown; reason: string };

export function liveSubscriptionKey(subscription: LiveSubscription): string {
  if (subscription.topic.startsWith('plugin:')) {
    return JSON.stringify([subscription.topic, 'identifier' in subscription ? (subscription.identifier ?? '') : '']);
  }
  return `${subscription.topic}:${subscription.resourceId ?? ''}`;
}
