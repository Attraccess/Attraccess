import {
  LIVE_UPDATES_SESSION_CHANGED,
  LiveEnvelope,
  LivePacket,
  LiveSubscription,
  liveSubscriptionKey,
} from '@attraccess/shared';
import { events } from 'fetch-event-stream';
import { v4 as uuidv4 } from 'uuid';

type Consumer = { update: (payload: unknown) => void; restore?: () => void; hasResourceState: boolean };
type ResourceState = { resourceId: number; inUse: boolean; timestamp?: string };
type Entry = { subscription: LiveSubscription; consumers: Set<Consumer>; snapshot?: ResourceState; rejected?: boolean };
interface Transport {
  id: string;
  abort: AbortController;
  ready: boolean;
  dirty: boolean;
  syncing: boolean;
  revision: number;
  lastPacket: number;
}

/** One instance per tab/origin/authentication context, owned by LiveUpdatesProvider. */
export class LiveUpdateClient {
  private readonly topics = new Map<string, Entry>();
  private transport?: Transport;
  private retry?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private failures = 0;
  private disposed = false;
  private connected = false;
  private reconciliationPending = false;
  private readonly visibilityChange = () => {
    const transport = this.transport;
    if (!transport || !this.topics.get('notifications:')?.consumers.size) return;
    transport.dirty = true;
    void this.sync(transport);
  };

  constructor(
    private readonly origin: string,
    private readonly expired: () => void = () => undefined,
    private readonly recovered: () => void = () => undefined,
  ) {}

  subscribe(subscription: LiveSubscription, update: Consumer['update'], restore?: Consumer['restore']): () => void {
    if (this.disposed) return () => undefined;
    const key = liveSubscriptionKey(subscription);
    let entry = this.topics.get(key);
    const isNewTopic = !entry?.consumers.size;
    if (!entry) {
      entry = { subscription, consumers: new Set() };
      this.topics.set(key, entry);
    }
    const consumer = { update, restore, hasResourceState: false };
    entry.consumers.add(consumer);
    this.replay(entry, consumer);
    if (isNewTopic || entry.rejected) this.changed();
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      entry.consumers.delete(consumer);
      if (entry.consumers.size === 0 && this.topics.get(key) === entry) {
        this.changed();
      }
    };
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
      for (const [key, entry] of this.topics) {
        if (!entry.consumers.size) this.topics.delete(key);
      }
      if (!this.hasConsumers()) this.stop();
      else {
        if (!this.transport && !this.retry) this.start();
        if (this.transport) void this.sync(this.transport);
      }
    });
  }

  private hasConsumers(): boolean {
    return [...this.topics.values()].some((entry) => entry.consumers.size > 0);
  }

  private replay(entry: Entry, consumer: Consumer): void {
    const snapshot = entry.snapshot;
    const transport = this.transport;
    if (!snapshot || !transport) return;
    queueMicrotask(() => {
      if (
        this.isCurrent(transport) &&
        this.topics.get(liveSubscriptionKey(entry.subscription)) === entry &&
        entry.consumers.has(consumer) &&
        entry.snapshot === snapshot &&
        !consumer.hasResourceState
      ) {
        consumer.hasResourceState = true;
        this.invoke(() => consumer.update({ ...snapshot }));
      }
    });
  }

  private deliver(event: LiveEnvelope, transport: Transport): void {
    const entry = this.topics.get(liveSubscriptionKey(event));
    if (!entry?.consumers.size) return;
    entry.rejected = false;
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
      if (this.isCurrent(transport) && entry.consumers.has(consumer)) {
        if (isResourceState) consumer.hasResourceState = true;
        this.invoke(() => consumer.update(payload));
      }
    });
  }

  private reject(subscription: unknown): void {
    if (
      !subscription ||
      typeof subscription !== 'object' ||
      !('topic' in subscription) ||
      typeof subscription.topic !== 'string'
    )
      return;
    const entry = this.topics.get(liveSubscriptionKey(subscription as LiveSubscription));
    if (entry) {
      entry.snapshot = undefined;
      entry.rejected = true;
    }
  }

  private isCurrent(transport: Transport): boolean {
    return this.transport === transport && !this.disposed && !transport.abort.signal.aborted;
  }

  private start(): void {
    if (this.disposed || !this.hasConsumers() || this.transport) return;
    const transport: Transport = {
      // uuid falls back to getRandomValues on supported plain-HTTP deployments.
      id: uuidv4(),
      abort: new AbortController(),
      ready: false,
      dirty: true,
      syncing: false,
      revision: 0,
      lastPacket: Date.now(),
    };
    this.transport = transport;
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.timer = setInterval(() => {
      if (Date.now() - transport.lastPacket > 35_000) transport.abort.abort();
      else {
        transport.dirty = true;
        void this.sync(transport);
      }
    }, 10_000);
    void this.consume(transport);
  }

  private async consume(transport: Transport): Promise<void> {
    try {
      // eslint-disable-next-line no-restricted-syntax -- Raw multiplexed SSE response.
      const response = await fetch(`${this.origin}/api/live-updates/${transport.id}/events`, {
        credentials: 'include',
        signal: transport.abort.signal,
      });
      if (!this.isCurrent(transport)) return;
      if (response.status === 401 || response.status === 403) {
        this.expire();
        return;
      }
      if (!response.ok) throw new Error(`Live stream returned ${response.status}`);
      for await (const message of events(response, transport.abort.signal)) {
        if (!this.isCurrent(transport)) return;
        transport.lastPacket = Date.now();
        let packet: LivePacket;
        try {
          packet = JSON.parse(message.data as string);
        } catch {
          continue;
        }
        if (packet.type === 'ready') {
          transport.ready = true;
          await this.sync(transport);
          if (!this.isCurrent(transport)) return;
          if (this.connected) {
            this.invoke(this.recovered);
            this.topics.forEach((entry) => entry.consumers.forEach((c) => this.invoke(c.restore)));
          }
          this.connected = true;
        } else if (packet.type === 'heartbeat') {
          // A healthy stream resets the exponential delay; a briefly opened stream does not.
          this.failures = 0;
        } else if (packet.type === 'event') {
          this.deliver(packet.event, transport);
        } else if (packet.type === 'rejected') {
          this.reject(packet.subscription);
          console.warn('[Live updates] Topic rejected:', packet.subscription, packet.reason);
        }
      }
    } catch (error) {
      if (!transport.abort.signal.aborted) console.warn('[Live updates] Stream interrupted:', error);
    } finally {
      this.reconnect(transport);
    }
  }

  private reconnect(transport: Transport): void {
    if (this.transport !== transport) return;
    this.stopTransport();
    if (!this.disposed && this.hasConsumers()) {
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
            subscriptions: [...this.topics.values()]
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

  private invoke(callback?: () => void): void {
    try {
      void Promise.resolve(callback?.()).catch((error) => {
        console.error('[Live updates] Consumer failed:', error);
      });
    } catch (error) {
      console.error('[Live updates] Consumer failed:', error);
    }
  }

  private stopTransport(): void {
    const transport = this.transport;
    this.transport = undefined;
    transport?.abort.abort();
    document.removeEventListener('visibilitychange', this.visibilityChange);
    clearInterval(this.timer);
    this.timer = undefined;
    this.topics.forEach((entry) => {
      entry.snapshot = undefined;
    });
  }

  private stop(): void {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.stopTransport();
    this.failures = 0;
  }

  private expire(): void {
    this.dispose();
    this.expired();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.topics.clear();
  }
}
