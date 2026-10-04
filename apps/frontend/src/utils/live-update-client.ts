import { LivePacket, LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { events } from 'fetch-event-stream';

type Consumer = { update: (payload: unknown) => void; restore?: () => void };
type Entry = { subscription: LiveSubscription; consumers: Set<Consumer> };
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

  constructor(
    private readonly origin: string,
    private readonly expired: () => void = () => undefined,
    private readonly recovered: () => void = () => undefined,
  ) {}

  subscribe(subscription: LiveSubscription, update: Consumer['update'], restore?: Consumer['restore']): () => void {
    if (this.disposed) return () => undefined;
    const key = liveSubscriptionKey(subscription);
    let entry = this.topics.get(key);
    const isNewTopic = !entry;
    if (!entry) {
      entry = { subscription, consumers: new Set() };
      this.topics.set(key, entry);
    }
    const consumer = { update, restore };
    entry.consumers.add(consumer);
    if (isNewTopic) this.changed();
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      entry.consumers.delete(consumer);
      if (entry.consumers.size === 0 && this.topics.get(key) === entry) {
        this.topics.delete(key);
        this.changed();
      }
    };
  }

  private changed(): void {
    if (!this.topics.size) {
      this.stop();
      return;
    }
    if (!this.transport && !this.retry) this.start();
    if (this.transport) {
      this.transport.revision++;
      this.transport.dirty = true;
      // Coalesce React mount/cleanup bursts into one authoritative topic set.
      queueMicrotask(() => {
        if (this.transport) void this.sync(this.transport);
      });
    }
  }

  private start(): void {
    if (this.disposed || !this.topics.size || this.transport) return;
    const transport: Transport = {
      id: crypto.randomUUID(),
      abort: new AbortController(),
      ready: false,
      dirty: true,
      syncing: false,
      revision: 0,
      lastPacket: Date.now(),
    };
    this.transport = transport;
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
      if (this.transport !== transport || this.disposed) return;
      if (response.status === 401 || response.status === 403) {
        this.expire();
        return;
      }
      if (!response.ok) throw new Error(`Live stream returned ${response.status}`);
      for await (const message of events(response, transport.abort.signal)) {
        if (this.transport !== transport || this.disposed) return;
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
          if (this.transport !== transport || transport.abort.signal.aborted) return;
          if (this.connected) {
            this.invoke(this.recovered);
            this.topics.forEach((entry) => entry.consumers.forEach((c) => this.invoke(c.restore)));
          }
          this.connected = true;
        } else if (packet.type === 'heartbeat') {
          // A healthy stream resets the exponential delay; a briefly opened stream does not.
          this.failures = 0;
        } else if (packet.type === 'event') {
          const entry = this.topics.get(liveSubscriptionKey(packet.event));
          entry?.consumers.forEach((consumer) => {
            if (this.transport === transport && entry.consumers.has(consumer)) {
              this.invoke(() => consumer.update(packet.event.payload));
            }
          });
        } else if (packet.type === 'rejected') {
          console.warn('[Live updates] Topic rejected:', packet.subscription, packet.reason);
        }
      }
    } catch (error) {
      if (!transport.abort.signal.aborted) console.warn('[Live updates] Stream interrupted:', error);
    } finally {
      if (this.transport === transport) {
        this.stopTransport();
        if (!this.disposed && this.topics.size) {
          const delay = Math.min(30_000, 500 * 2 ** Math.min(this.failures++, 6)) * (0.75 + Math.random() * 0.25);
          this.retry = setTimeout(() => {
            this.retry = undefined;
            this.start();
          }, delay);
        }
      }
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
            subscriptions: [...this.topics.values()].map((entry) => entry.subscription),
          }),
        });
        if (this.transport !== transport) return;
        if (response.status === 401 || response.status === 403) {
          this.expire();
          return;
        }
        if (!response.ok) throw new Error(`Live subscriptions returned ${response.status}`);
      }
    } catch {
      transport.abort.abort();
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
    clearInterval(this.timer);
    this.timer = undefined;
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
