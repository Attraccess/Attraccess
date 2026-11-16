import {
  PLUGIN_BLE_LIMITS,
  PluginBleCallOptions,
  PluginBleCloseReason,
  PluginBleError,
  PluginBleNotification,
  PluginBleNotificationStream,
  PluginBleProfile,
  PluginBleSession,
  PluginBleWriteOptions,
} from './plugin-ble';
import {
  checkBleInboundPayload,
  prepareBleRead,
  prepareBleSubscribe,
  prepareBleWrite,
  resolveBleTimeout,
  toBleError,
} from './plugin-ble-validation';

/** What the fake session needs from a connected peripheral. Fake-internal; not part of the public contract. */
export interface FakeSessionLink {
  read(request: { serviceUuid: string; characteristicUuid: string; signal: AbortSignal }): Promise<Uint8Array>;
  write(request: {
    serviceUuid: string;
    characteristicUuid: string;
    value: Uint8Array;
    withoutResponse: boolean;
    signal: AbortSignal;
  }): Promise<void>;
  subscribe(request: {
    serviceUuid: string;
    characteristicUuid: string;
    indicate: boolean;
    signal: AbortSignal;
    onNotification(value: Uint8Array): void;
  }): Promise<void>;
  unsubscribe(request: { serviceUuid: string; characteristicUuid: string }): Promise<void>;
  disconnect(): Promise<void>;
}

export interface FakeSessionClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): () => void;
}

export interface FakeSessionDeps {
  id: string;
  endpointId: string;
  profile: PluginBleProfile;
  clock: FakeSessionClock;
  connect(signal: AbortSignal, timeoutMs: number): Promise<FakeSessionLink>;
  onClosed(session: FakeSession): void;
}

interface ActiveOperation {
  settled: boolean;
  controller: AbortController;
  fail(error: PluginBleError): void;
}

function closeError(reason: PluginBleCloseReason, operation: string): PluginBleError {
  if (reason === 'disconnected') return new PluginBleError('DISCONNECTED', 'The device disconnected', { operation });
  if (reason === 'cancelled') return new PluginBleError('CANCELLED', 'The session was cancelled', { operation });
  return new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation, detail: reason });
}

function cancelled(operation: string): PluginBleError {
  return new PluginBleError('CANCELLED', `${operation} was cancelled`, { operation });
}

class FakeNotificationStream implements PluginBleNotificationStream {
  private readonly queue: PluginBleNotification[] = [];
  private readonly waiters: Array<{ resolve(n: PluginBleNotification): void; reject(e: PluginBleError): void }> = [];
  private terminal: PluginBleError | null = null;

  constructor(
    private readonly key: string,
    private readonly capacity: number,
    private readonly clock: FakeSessionClock,
    private readonly onUnsubscribe: () => Promise<void>,
  ) {}

  push(value: Uint8Array): void {
    if (this.terminal) return;
    const notification = { key: this.key, value, receivedAt: new Date(this.clock.now()) };
    const waiter = this.waiters.shift();
    if (waiter) return waiter.resolve(notification);
    if (this.queue.length >= this.capacity) {
      return this.end(
        new PluginBleError('NOTIFICATION_OVERFLOW', `Notification queue of "${this.key}" overflowed`, {
          operation: 'subscribe',
          detail: `capacity ${this.capacity}`,
        }),
      );
    }
    this.queue.push(notification);
  }

  /** Ends the stream with the error every pending and later `next()` rejects with. */
  end(error: PluginBleError): void {
    if (this.terminal) return;
    this.terminal = error;
    this.queue.length = 0;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  get ended(): boolean {
    return this.terminal !== null;
  }

  next(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<PluginBleNotification> {
    return this.take(options, true);
  }

  private take(
    options: { timeoutMs?: number; signal?: AbortSignal },
    useTimeout: boolean,
  ): Promise<PluginBleNotification> {
    try {
      const timeoutMs = useTimeout
        ? resolveBleTimeout(options.timeoutMs, PLUGIN_BLE_LIMITS.opTimeoutDefaultMs, PLUGIN_BLE_LIMITS.opTimeoutMaxMs)
        : 0;
      const queued = this.queue.shift();
      if (queued) return Promise.resolve(queued);
      if (this.terminal) return Promise.reject(this.terminal);
      if (options.signal?.aborted) return Promise.reject(cancelled('next'));
      return new Promise((resolve, reject) => {
        let cancelTimer: (() => void) | undefined;
        const cleanup = () => {
          cancelTimer?.();
          options.signal?.removeEventListener('abort', onAbort);
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
        };
        const waiter = {
          resolve: (n: PluginBleNotification) => (cleanup(), resolve(n)),
          reject: (e: PluginBleError) => (cleanup(), reject(e)),
        };
        const onAbort = () => waiter.reject(cancelled('next'));
        options.signal?.addEventListener('abort', onAbort, { once: true });
        if (useTimeout) {
          cancelTimer = this.clock.setTimeout(
            () =>
              waiter.reject(new PluginBleError('TIMEOUT', 'No notification arrived in time', { operation: 'next' })),
            timeoutMs,
          );
        }
        this.waiters.push(waiter);
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  unsubscribe(): Promise<void> {
    return this.onUnsubscribe();
  }

  [Symbol.asyncIterator](): AsyncIterator<PluginBleNotification> {
    return {
      next: async () => {
        try {
          return { value: await this.take({}, false), done: false };
        } catch (error) {
          if (error instanceof PluginBleError && (error.code === 'CANCELLED' || error.code === 'SESSION_CLOSED')) {
            return { value: undefined, done: true };
          }
          throw error;
        }
      },
      return: async () => {
        await this.unsubscribe();
        return { value: undefined, done: true };
      },
    };
  }
}

/**
 * Session semantics of the contract: one operation at a time in call order, per-call deadlines, a lease,
 * cancellation, bounded notification queues and exactly-once settlement of every pending promise.
 */
export class FakeSession implements PluginBleSession {
  readonly id: string;
  readonly endpointId: string;
  readonly closed: Promise<{ reason: PluginBleCloseReason }>;

  private state: 'connecting' | 'open' | 'closed' = 'connecting';
  private link: FakeSessionLink | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly active = new Set<ActiveOperation>();
  private readonly subscriptions = new Map<
    string,
    { stream: FakeNotificationStream; target: ReturnType<typeof prepareBleRead> }
  >();
  private resolveClosed!: (value: { reason: PluginBleCloseReason }) => void;
  private connectController = new AbortController();
  private rejectConnect: ((error: PluginBleError) => void) | null = null;
  private cancelLease: (() => void) | null = null;
  private detachOpenSignal: (() => void) | null = null;
  private closing: Promise<void> | null = null;
  private closeReason: PluginBleCloseReason = 'closed';

  constructor(private readonly deps: FakeSessionDeps) {
    this.id = deps.id;
    this.endpointId = deps.endpointId;
    this.closed = new Promise((resolve) => (this.resolveClosed = resolve));
  }

  /** Connects the link. Rejects, with the session closed, when the connect fails, times out or is cancelled. */
  async open(options: { signal?: AbortSignal; leaseMs: number; connectTimeoutMs: number }): Promise<void> {
    const { signal } = options;
    if (signal) {
      const onAbort = () => void this.close('cancelled');
      signal.addEventListener('abort', onAbort, { once: true });
      this.detachOpenSignal = () => signal.removeEventListener('abort', onAbort);
      if (signal.aborted) onAbort();
    }
    let link: FakeSessionLink;
    try {
      link = await new Promise<FakeSessionLink>((resolve, reject) => {
        if (this.state === 'closed') return reject(closeError(this.closeReason, 'connect'));
        let settled = false;
        const fail = (error: PluginBleError) => {
          settled = true;
          reject(error);
        };
        this.rejectConnect = fail;
        const cancelTimer = this.deps.clock.setTimeout(() => {
          this.connectController.abort();
          fail(new PluginBleError('TIMEOUT', 'Connecting timed out', { operation: 'connect' }));
        }, options.connectTimeoutMs);
        this.deps.connect(this.connectController.signal, options.connectTimeoutMs).then(
          (value) => {
            cancelTimer();
            // A link that arrives after the connect already failed must not be leaked.
            if (settled) return void value.disconnect().catch(() => undefined);
            settled = true;
            resolve(value);
          },
          (error) => (cancelTimer(), settled || fail(toBleError(error, 'connect'))),
        );
      });
    } catch (error) {
      const failure = toBleError(error, 'connect');
      void this.close(this.state === 'closed' ? this.closeReason : 'error');
      throw failure;
    } finally {
      this.rejectConnect = null;
    }
    if (this.state === 'closed') {
      await link.disconnect().catch(() => undefined);
      throw closeError(this.closeReason, 'connect');
    }
    this.link = link;
    this.state = 'open';
    this.cancelLease = this.deps.clock.setTimeout(() => void this.close('lease-expired'), options.leaseMs);
  }

  /** Called by the transport when the link was lost. */
  linkLost(): void {
    void this.close('disconnected');
  }

  close(reason: PluginBleCloseReason = 'closed'): Promise<void> {
    if (this.closing) return this.closing;
    this.state = 'closed';
    this.closeReason = reason;
    this.cancelLease?.();
    this.detachOpenSignal?.();
    this.resolveClosed({ reason });
    this.connectController.abort();
    this.rejectConnect?.(closeError(reason, 'connect'));
    for (const operation of [...this.active]) {
      operation.controller.abort();
      operation.fail(closeError(reason, 'operation'));
    }
    for (const { stream } of this.subscriptions.values()) stream.end(closeError(reason, 'subscribe'));
    this.subscriptions.clear();
    const link = this.link;
    this.link = null;
    this.deps.onClosed(this);
    this.closing = (async () => {
      if (link && reason !== 'disconnected') await link.disconnect().catch(() => undefined);
    })();
    return this.closing;
  }

  read(key: string, options: PluginBleCallOptions = {}): Promise<Uint8Array> {
    return this.run('read', options, () => {
      const target = prepareBleRead(this.deps.profile, key);
      return async (signal, link) => {
        const value = await link.read({
          serviceUuid: target.serviceUuid,
          characteristicUuid: target.characteristic.uuid,
          signal,
        });
        return checkBleInboundPayload(target.characteristic, 'read', value);
      };
    });
  }

  write(key: string, value: Uint8Array, options: PluginBleWriteOptions = {}): Promise<void> {
    return this.run('write', options, () => {
      const prepared = prepareBleWrite(this.deps.profile, key, value, options.withoutResponse === true);
      return (signal, link) =>
        link.write({
          serviceUuid: prepared.serviceUuid,
          characteristicUuid: prepared.characteristic.uuid,
          value: prepared.value,
          withoutResponse: prepared.withoutResponse,
          signal,
        });
    });
  }

  subscribe(key: string, options: { signal?: AbortSignal } = {}): Promise<PluginBleNotificationStream> {
    return this.run('subscribe', options, () => {
      const target = prepareBleSubscribe(this.deps.profile, key);
      if (this.subscriptions.has(key)) {
        throw new PluginBleError('INVALID_ARGUMENT', `"${key}" is already subscribed`, { operation: 'subscribe' });
      }
      return async (signal, link) => {
        const stream = new FakeNotificationStream(
          key,
          this.deps.profile.limits.maxNotificationQueue,
          this.deps.clock,
          () => this.unsubscribe(key),
        );
        this.subscriptions.set(key, { stream, target });
        try {
          await link.subscribe({
            serviceUuid: target.serviceUuid,
            characteristicUuid: target.characteristic.uuid,
            indicate: target.indicate,
            signal,
            onNotification: (bytes) => this.deliver(key, stream, target, bytes),
          });
        } catch (error) {
          if (this.subscriptions.get(key)?.stream === stream) this.subscriptions.delete(key);
          throw error;
        }
        return stream;
      };
    });
  }

  unsubscribe(key: string): Promise<void> {
    return this.run('unsubscribe', {}, () => {
      const subscription = this.subscriptions.get(key);
      if (!subscription) {
        // Unknown keys are still rejected; a known key without a subscription is a no-op.
        prepareBleSubscribe(this.deps.profile, key);
        return async () => undefined;
      }
      return async (_signal, link) => {
        this.subscriptions.delete(key);
        subscription.stream.end(cancelled('next'));
        await link.unsubscribe({
          serviceUuid: subscription.target.serviceUuid,
          characteristicUuid: subscription.target.characteristic.uuid,
        });
      };
    });
  }

  private deliver(
    key: string,
    stream: FakeNotificationStream,
    target: ReturnType<typeof prepareBleRead>,
    bytes: Uint8Array,
  ): void {
    if (this.subscriptions.get(key)?.stream !== stream) return;
    try {
      stream.push(checkBleInboundPayload(target.characteristic, 'notification', bytes));
    } catch (error) {
      stream.end(toBleError(error, 'subscribe'));
    }
    if (stream.ended) {
      this.subscriptions.delete(key);
      // Overflow tears the subscription down on the link as well.
      void this.link
        ?.unsubscribe({ serviceUuid: target.serviceUuid, characteristicUuid: target.characteristic.uuid })
        .catch(() => undefined);
    }
  }

  /**
   * Queues one operation. `prepare` validates synchronously (before anything is queued or reaches the link) and
   * returns the function that talks to the link.
   */
  private run<T>(
    operation: string,
    options: { signal?: AbortSignal; timeoutMs?: number },
    prepare: () => (signal: AbortSignal, link: FakeSessionLink) => Promise<T>,
  ): Promise<T> {
    let execute: (signal: AbortSignal, link: FakeSessionLink) => Promise<T>;
    let timeoutMs: number;
    try {
      if (this.state !== 'open') {
        throw new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation, detail: this.closeReason });
      }
      timeoutMs = resolveBleTimeout(
        options.timeoutMs,
        PLUGIN_BLE_LIMITS.opTimeoutDefaultMs,
        PLUGIN_BLE_LIMITS.opTimeoutMaxMs,
      );
      execute = prepare();
      if (options.signal?.aborted) throw cancelled(operation);
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      let cancelTimer: (() => void) | undefined;
      let finished!: () => void;
      const done = new Promise<void>((resolveDone) => (finished = resolveDone));
      const op: ActiveOperation = {
        settled: false,
        controller: new AbortController(),
        fail: (error) => settle(() => reject(error)),
      };
      const settle = (complete: () => void) => {
        if (op.settled) return;
        op.settled = true;
        cancelTimer?.();
        options.signal?.removeEventListener('abort', onAbort);
        this.active.delete(op);
        finished();
        complete();
      };
      const onAbort = () => {
        op.controller.abort();
        op.fail(cancelled(operation));
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.active.add(op);
      this.tail = this.tail.then(async () => {
        if (op.settled || !this.link) return;
        cancelTimer = this.deps.clock.setTimeout(() => {
          op.controller.abort();
          op.fail(new PluginBleError('TIMEOUT', `${operation} timed out`, { operation }));
        }, timeoutMs);
        const attempt = execute(op.controller.signal, this.link).then(
          (value) => settle(() => resolve(value)),
          (error) => {
            const failure = toBleError(error, operation);
            // The driver reporting a lost link ends the session; timeouts and cancellations do not.
            if (failure.code === 'DISCONNECTED') void this.close('disconnected');
            op.fail(failure);
          },
        );
        // A timed-out or cancelled operation must not block the queue behind a hung link call.
        await Promise.race([attempt, done]);
      });
    });
  }
}
