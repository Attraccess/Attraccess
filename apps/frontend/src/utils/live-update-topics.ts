import { LiveEnvelope, LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { Consumer, Entry, Transport } from './live-update-client.types';
import { invokeLiveCallback } from './live-update-callback';

interface TopicOwner {
  isDisposed(): boolean;
  isInterrupted(): boolean;
  transport(): Transport | undefined;
  isCurrent(transport: Transport): boolean;
  changed(): void;
}

/** References, outage notifications and replay state for one authenticated client. */
export class LiveUpdateTopics {
  readonly entries = new Map<string, Entry>();

  constructor(private readonly owner: TopicOwner) {}

  hasConsumers(): boolean {
    return [...this.entries.values()].some((entry) => entry.consumers.size > 0);
  }

  subscribe(
    subscription: LiveSubscription,
    update: Consumer['update'],
    restore?: Consumer['restore'],
    unavailable?: Consumer['unavailable'],
  ): () => void {
    if (this.owner.isDisposed()) return () => undefined;
    const key = liveSubscriptionKey(subscription);
    let entry = this.entries.get(key);
    const isNewTopic = !entry?.consumers.size;
    if (!entry) {
      entry = { subscription, consumers: new Set(), unavailable: this.owner.isInterrupted() };
      this.entries.set(key, entry);
    }
    const consumer = { update, restore, unavailable, hasResourceState: false };
    entry.consumers.add(consumer);
    this.replay(entry, consumer);
    if (entry.unavailable) {
      const currentEntry = entry;
      queueMicrotask(() => {
        if (
          !this.owner.isDisposed() &&
          this.entries.get(key) === currentEntry &&
          currentEntry.unavailable &&
          currentEntry.consumers.has(consumer)
        )
          invokeLiveCallback(consumer.unavailable);
      });
    }
    if (isNewTopic || entry.rejected) this.owner.changed();
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      entry.consumers.delete(consumer);
      if (entry.consumers.size === 0 && this.entries.get(key) === entry) {
        this.owner.changed();
      }
    };
  }

  private replay(entry: Entry, consumer: Consumer): void {
    const snapshot = entry.snapshot;
    const transport = this.owner.transport();
    if (!snapshot || !transport) return;
    queueMicrotask(() => {
      if (
        this.owner.isCurrent(transport) &&
        this.entries.get(liveSubscriptionKey(entry.subscription)) === entry &&
        entry.consumers.has(consumer) &&
        entry.snapshot === snapshot &&
        !consumer.hasResourceState
      ) {
        consumer.hasResourceState = true;
        invokeLiveCallback(() => consumer.update({ ...snapshot }));
      }
    });
  }

  deliver(event: LiveEnvelope, transport: Transport): void {
    const entry = this.entries.get(liveSubscriptionKey(event));
    if (!entry?.consumers.size) return;
    entry.rejected = false;
    entry.unavailable = false;
    const payload = event.payload;
    let isResourceState = false;
    if (
      event.topic === 'resource' &&
      payload &&
      typeof payload === 'object' &&
      'inUse' in payload &&
      typeof payload.inUse === 'boolean'
    ) {
      isResourceState = true;
      entry.snapshot = {
        resourceId: event.resourceId,
        inUse: payload.inUse,
        ...('timestamp' in payload && typeof payload.timestamp === 'string' ? { timestamp: payload.timestamp } : {}),
      };
    }
    entry.consumers.forEach((consumer) => {
      if (this.owner.isCurrent(transport) && entry.consumers.has(consumer)) {
        if (isResourceState) consumer.hasResourceState = true;
        invokeLiveCallback(() => consumer.update(payload));
      }
    });
  }

  reject(subscription: unknown): void {
    if (
      !subscription ||
      typeof subscription !== 'object' ||
      !('topic' in subscription) ||
      typeof subscription.topic !== 'string'
    )
      return;
    const entry = this.entries.get(liveSubscriptionKey(subscription as LiveSubscription));
    if (entry) {
      entry.snapshot = undefined;
      entry.rejected = true;
      this.markUnavailable(entry);
    }
  }

  recover(): void {
    for (const entry of this.entries.values()) {
      if (!entry.rejected) entry.unavailable = false;
    }
  }

  markUnavailable(entry: Entry): void {
    if (entry.unavailable) return;
    entry.unavailable = true;
    // Snapshot the set so subscriptions added by a callback use their queued notification.
    for (const consumer of [...entry.consumers]) {
      if (!this.owner.isDisposed() && entry.consumers.has(consumer)) invokeLiveCallback(consumer.unavailable);
    }
  }
}
