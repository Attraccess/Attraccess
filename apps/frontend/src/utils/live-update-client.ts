import { LIVE_UPDATES_SESSION_CHANGED, LiveSubscription } from '@attraccess/shared';
import { Consumer, Transport } from './live-update-client.types';
import { invokeLiveCallback } from './live-update-callback';
import { LiveUpdateTopics } from './live-update-topics';
import { consumeLiveTransport, createLiveTransport } from './live-update-transport';

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
