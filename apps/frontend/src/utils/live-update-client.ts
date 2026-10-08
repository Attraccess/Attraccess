import {
  LIVE_UPDATES_SESSION_CHANGED,
  LiveSubscription,
  LiveEnvelope,
  LivePacket,
  liveSubscriptionKey,
} from '@attraccess/shared';
import { v4 as uuidv4 } from 'uuid';
import { events } from 'fetch-event-stream';

export type Consumer = {
  update: (payload: unknown) => void;
  restore?: () => void;
  unavailable?: () => void;
  hasResourceState: boolean;
};

type ResourceState = { resourceId: number; inUse: boolean; timestamp?: string };

export type Entry = {
  subscription: LiveSubscription;
  consumers: Set<Consumer>;
  snapshot?: ResourceState;
  rejected?: boolean;
  unavailable?: boolean;
};

export interface Transport {
  id: string;
  abort: AbortController;
  ready: boolean;
  dirty: boolean;
  syncing: boolean;
  revision: number;
  lastPacket: number;
}

export function invokeLiveCallback(callback?: () => void): void {
  try {
    void Promise.resolve(callback?.()).catch((error) => {
      console.error('[Live updates] Consumer failed:', error);
    });
  } catch (error) {
    console.error('[Live updates] Consumer failed:', error);
  }
}

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

interface TransportOwner {
  isCurrent(transport: Transport): boolean;
  expire(): void;
  sync(transport: Transport): Promise<void>;
  ready(): void;
  heartbeat(): void;
  deliver(event: LiveEnvelope, transport: Transport): void;
  reject(subscription: unknown): void;
  reconnect(transport: Transport): void;
}

export async function consumeLiveTransport(origin: string, transport: Transport, owner: TransportOwner): Promise<void> {
  try {
    // eslint-disable-next-line no-restricted-syntax -- Raw multiplexed SSE response.
    const response = await fetch(`${origin}/api/live-updates/${transport.id}/events`, {
      credentials: 'include',
      signal: transport.abort.signal,
    });
    if (!owner.isCurrent(transport)) return;
    if (response.status === 401 || response.status === 403) {
      owner.expire();
      return;
    }
    if (!response.ok) throw new Error(`Live stream returned ${response.status}`);
    for await (const message of events(response, transport.abort.signal)) {
      if (!owner.isCurrent(transport)) return;
      transport.lastPacket = Date.now();
      let packet: LivePacket;
      try {
        packet = JSON.parse(message.data as string);
      } catch {
        continue;
      }
      if (packet.type === 'ready') {
        transport.ready = true;
        await owner.sync(transport);
        if (!owner.isCurrent(transport)) return;
        owner.ready();
      } else if (packet.type === 'heartbeat') {
        // A healthy stream resets the exponential delay; a briefly opened stream does not.
        owner.heartbeat();
      } else if (packet.type === 'event') {
        owner.deliver(packet.event, transport);
      } else if (packet.type === 'rejected') {
        owner.reject(packet.subscription);
        console.warn('[Live updates] Topic rejected:', packet.subscription, packet.reason);
      }
    }
  } catch (error) {
    if (!transport.abort.signal.aborted) console.warn('[Live updates] Stream interrupted:', error);
  } finally {
    owner.reconnect(transport);
  }
}

export function createLiveTransport(): Transport {
  return {
    // uuid falls back to getRandomValues on supported plain-HTTP deployments.
    id: uuidv4(),
    abort: new AbortController(),
    ready: false,
    dirty: true,
    syncing: false,
    revision: 0,
    lastPacket: Date.now(),
  };
}

/** One instance per tab/origin/authentication context, owned by LiveUpdatesProvider. */
export class LiveUpdateClient {
  private readonly topics = new LiveUpdateTopics({
    isDisposed: () => this.disposed,
    isInterrupted: () => this.interrupted,
    transport: () => this.transport,
    isCurrent: (transport) => this.isCurrent(transport),
    changed: () => this.changed(),
  });
  private transport?: Transport;
  private retry?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private failures = 0;
  private disposed = false;
  private connected = false;
  private interrupted = false;
  private reconciliationPending = false;
  private readonly visibilityChange = () => {
    const transport = this.transport;
    if (!transport || !this.topics.entries.get('notifications:')?.consumers.size) return;
    transport.dirty = true;
    void this.sync(transport);
  };

  constructor(
    private readonly origin: string,
    private readonly expired: () => void = () => undefined,
    private readonly recovered: () => void = () => undefined,
  ) {}

  subscribe(
    subscription: LiveSubscription,
    update: Consumer['update'],
    restore?: Consumer['restore'],
    unavailable?: Consumer['unavailable'],
  ): () => void {
    return this.topics.subscribe(subscription, update, restore, unavailable);
  }

  private changed(): void {
    if (this.transport) {
      this.transport.revision++;
      this.transport.dirty = true;
    }
    if (this.reconciliationPending) return;
    this.reconciliationPending = true;
    // Keep the stream and same-key snapshot through React cleanup/setup bursts.
    queueMicrotask(() => {
      this.reconciliationPending = false;
      if (this.disposed) return;
      for (const [key, entry] of this.topics.entries) {
        if (!entry.consumers.size) this.topics.entries.delete(key);
      }
      if (!this.topics.hasConsumers()) this.stop();
      else {
        if (!this.transport && !this.retry) this.start();
        if (this.transport) void this.sync(this.transport);
      }
    });
  }

  private isCurrent(transport: Transport): boolean {
    return this.transport === transport && !this.disposed && !transport.abort.signal.aborted;
  }

  private start(): void {
    if (this.disposed || !this.topics.hasConsumers() || this.transport) return;
    const transport = createLiveTransport();
    this.transport = transport;
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.timer = setInterval(() => {
      if (Date.now() - transport.lastPacket > 35_000) transport.abort.abort();
      else {
        transport.dirty = true;
        void this.sync(transport);
      }
    }, 10_000);
    void consumeLiveTransport(this.origin, transport, {
      isCurrent: (current) => this.isCurrent(current),
      expire: () => this.expire(),
      sync: (current) => this.sync(current),
      ready: () => {
        this.interrupted = false;
        this.topics.recover();
        if (this.connected) {
          invokeLiveCallback(this.recovered);
          this.topics.entries.forEach((entry) => entry.consumers.forEach((c) => invokeLiveCallback(c.restore)));
        }
        this.connected = true;
      },
      heartbeat: () => {
        this.failures = 0;
      },
      deliver: (event, current) => this.topics.deliver(event, current),
      reject: (subscription) => this.topics.reject(subscription),
      reconnect: (current) => this.reconnect(current),
    });
  }

  private reconnect(transport: Transport): void {
    if (this.transport !== transport) return;
    this.stopTransport();
    if (!this.disposed && this.topics.hasConsumers()) {
      // Keep outage state through backoff and replacement-stream startup.
      this.interrupted = true;
      this.topics.entries.forEach((entry) => this.topics.markUnavailable(entry));
      if (this.disposed || !this.topics.hasConsumers()) return;
      const delay = Math.min(30_000, 500 * 2 ** Math.min(this.failures++, 6)) * (0.75 + Math.random() * 0.25);
      this.retry = setTimeout(() => {
        this.retry = undefined;
        this.start();
      }, delay);
    }
  }

  private async sync(transport: Transport): Promise<void> {
    if (!transport.ready || transport.syncing || this.transport !== transport) return;
    transport.syncing = true;
    try {
      while (transport.dirty && this.transport === transport && !transport.abort.signal.aborted) {
        transport.dirty = false;
        // eslint-disable-next-line no-restricted-syntax -- Authenticated control plane for the bundled stream.
        const response = await fetch(`${this.origin}/api/live-updates/${transport.id}/subscriptions`, {
          method: 'PUT',
          credentials: 'include',
          signal: transport.abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            revision: transport.revision,
            present: document.visibilityState === 'visible',
            subscriptions: [...this.topics.entries.values()]
              .filter((entry) => entry.consumers.size)
              .map((entry) => entry.subscription),
          }),
        });
        if (!this.isCurrent(transport)) return;
        if (response.status === 403) {
          const body: unknown = await response.json().catch(() => null);
          // Reading an error body can finish after logout or transport replacement.
          if (!this.isCurrent(transport)) return;
          if (body && typeof body === 'object' && 'code' in body && body.code === LIVE_UPDATES_SESSION_CHANGED) {
            this.reconnect(transport);
            return;
          }
        }
        if (response.status === 401 || response.status === 403) {
          this.expire();
          return;
        }
        if (!response.ok) throw new Error(`Live subscriptions returned ${response.status}`);
      }
    } catch {
      this.reconnect(transport);
    } finally {
      transport.syncing = false;
    }
  }

  private stopTransport(): void {
    const transport = this.transport;
    this.transport = undefined;
    transport?.abort.abort();
    document.removeEventListener('visibilitychange', this.visibilityChange);
    clearInterval(this.timer);
    this.timer = undefined;
    this.topics.entries.forEach((entry) => {
      entry.snapshot = undefined;
    });
  }

  private stop(): void {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.stopTransport();
    this.failures = 0;
    this.interrupted = false;
  }

  private expire(): void {
    this.dispose();
    this.expired();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.topics.entries.clear();
  }
}
