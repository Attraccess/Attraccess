import {
  PLUGIN_BLE_LIMITS,
  PluginBleCallOptions,
  PluginBleCloseReason,
  PluginBleError,
  PluginBleErrorCode,
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
import { BleNotificationStream, cancelledBleCall } from './plugin-ble-notification-stream';

/**
 * The session state machine shared by the host and the fake transport, so their semantics cannot drift.
 *
 * @internal Building block for the host implementation and `createFakeBleHost`. Plugins never construct it:
 * they receive a `PluginBleSession` from `context.ble`.
 */

/**
 * A connected peripheral, as the session engine sees it. Receives only validated, normalized primitives.
 * `timeoutMs` is the engine's own deadline for the call, so a transport can enforce it on its side as well.
 */
export interface BleSessionLink {
  /** Negotiated ATT MTU. A link without one counts as the BLE minimum (23). */
  readonly mtu?: number;
  read(request: {
    serviceUuid: string;
    characteristicUuid: string;
    signal: AbortSignal;
    timeoutMs?: number;
  }): Promise<Uint8Array>;
  write(request: {
    serviceUuid: string;
    characteristicUuid: string;
    value: Uint8Array;
    withoutResponse: boolean;
    signal: AbortSignal;
    timeoutMs?: number;
  }): Promise<void>;
  subscribe(request: {
    serviceUuid: string;
    characteristicUuid: string;
    indicate: boolean;
    signal: AbortSignal;
    timeoutMs?: number;
    onNotification(value: Uint8Array): void;
    /** The transport failed the stream (overflow, malformed or oversized notification); it is torn down. */
    onError?(error: PluginBleError): void;
  }): Promise<void>;
  unsubscribe(request: { serviceUuid: string; characteristicUuid: string; timeoutMs?: number }): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * Registers the callback for a lost link. A link already lost must call it right away. `detail` is a safe
   * diagnostic (e.g. `reader-link-lost`) that pending calls fail with.
   */
  onDisconnected?(listener: (detail?: string) => void): void;
}

export interface BleSessionClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): () => void;
}

export interface BleSessionEngineDeps {
  id: string;
  endpointId: string;
  profile: PluginBleProfile;
  clock: BleSessionClock;
  connect(signal: AbortSignal, timeoutMs: number): Promise<BleSessionLink>;
  /** Called once the session has fully closed (after the link disconnected or its deadline passed). */
  onClosed(engine: BleSessionEngine): void;
  /**
   * Logging of operation, outcome, duration and, for a failure, its safe `detail` (e.g. `att:0x0a`). Never receives
   * payload bytes.
   */
  log?(operation: string, outcome: string, durationMs: number, detail?: string): void;
  /** A call the engine refused before it reached the link (validation, bounds, closed session). */
  onRejected?(operation: string, error: PluginBleError): void;
  /**
   * The engine failed a notification stream itself: its queue overflowed (`NOTIFICATION_OVERFLOW`) or a notification
   * broke the profile bound. Failures the link reported through `onError` are the link's to count.
   */
  onStreamFailed?(errorCode: PluginBleErrorCode, detail?: string): void;
}

/** How long a close waits for the link to disconnect before the session counts as closed anyway. */
const DISCONNECT_DEADLINE_MS = PLUGIN_BLE_LIMITS.opTimeoutDefaultMs;

type Executor<T> = (signal: AbortSignal, link: BleSessionLink, timeoutMs: number) => Promise<T>;
type Target = ReturnType<typeof prepareBleRead>;

interface ActiveOperation {
  settled: boolean;
  controller: AbortController;
  fail(error: PluginBleError): void;
}

function closeError(reason: PluginBleCloseReason, operation: string, detail?: string): PluginBleError {
  if (reason === 'disconnected') {
    return new PluginBleError('DISCONNECTED', 'The device disconnected', { operation, detail });
  }
  if (reason === 'cancelled') return new PluginBleError('CANCELLED', 'The session was cancelled', { operation });
  return new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation, detail: reason });
}

const cancelled = cancelledBleCall;

function normalizeMtu(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return PLUGIN_BLE_LIMITS.mtuMin;
  return Math.min(Math.max(value, PLUGIN_BLE_LIMITS.mtuMin), PLUGIN_BLE_LIMITS.mtuMax);
}

/** Calls `fn` so that a synchronous throw becomes a rejection. */
function attempt<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(fn);
}

/**
 * Session semantics of the contract: one operation at a time in call order, per-call deadlines, a lease,
 * cancellation, bounded notification queues and exactly-once settlement of every pending promise.
 */
export class BleSessionEngine {
  readonly id: string;
  readonly endpointId: string;
  /** Resolves once the session has fully closed: pending calls are settled and the link is released. */
  readonly closed: Promise<{ reason: PluginBleCloseReason }>;
  /** What plugins get: a frozen object without the link, the dependencies or any other internals. */
  readonly handle: PluginBleSession;

  private state: 'connecting' | 'open' | 'closed' = 'connecting';
  private link: BleSessionLink | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly active = new Set<ActiveOperation>();
  private readonly subscriptions = new Map<string, { stream: BleNotificationStream; target: Target }>();
  /** Keys with a queued or running subscribe, so two concurrent subscribes cannot both succeed. */
  private readonly subscribing = new Set<string>();
  /** Streams whose subscribe is still running on the link; they already receive notifications. */
  private readonly starting = new Map<string, BleNotificationStream>();
  private resolveClosed!: (value: { reason: PluginBleCloseReason }) => void;
  private readonly connectController = new AbortController();
  private rejectConnect: ((error: PluginBleError) => void) | null = null;
  private cancelLease: (() => void) | null = null;
  private detachOpenSignal: (() => void) | null = null;
  private closing: Promise<void> | null = null;
  private closeReason: PluginBleCloseReason = 'closed';
  /** Why the link was lost, for the DISCONNECTED errors of pending calls. */
  private lostDetail: string | undefined;
  /** Settles once `open()` adopted or released its link. */
  private openSettled: Promise<void> = Promise.resolve();
  /** Settles once the transport's connect call returned and a link that arrived too late was released. */
  private connectWork: Promise<void> = Promise.resolve();
  private connectPending = false;
  private linkMtu: number = PLUGIN_BLE_LIMITS.mtuMin;

  constructor(private readonly deps: BleSessionEngineDeps) {
    this.id = deps.id;
    this.endpointId = deps.endpointId;
    this.closed = new Promise((resolve) => (this.resolveClosed = resolve));
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the frozen handle reads the live MTU
    const engine = this;
    this.handle = Object.freeze({
      id: this.id,
      endpointId: this.endpointId,
      closed: this.closed,
      get mtu() {
        return engine.mtu;
      },
      read: (key: string, options?: PluginBleCallOptions) => this.read(key, options),
      write: (key: string, value: Uint8Array, options?: PluginBleWriteOptions) => this.write(key, value, options),
      subscribe: (key: string, options?: { signal?: AbortSignal }) => this.subscribe(key, options),
      unsubscribe: (key: string) => this.unsubscribe(key),
      close: () => this.close(),
    });
  }

  get isClosed(): boolean {
    return this.state === 'closed';
  }

  /** The link's negotiated ATT MTU, kept after the session closed. */
  get mtu(): number {
    return this.linkMtu;
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
    let markOpenSettled!: () => void;
    this.openSettled = new Promise<void>((resolve) => (markOpenSettled = resolve));
    let link: BleSessionLink;
    try {
      link = await this.connect(options.connectTimeoutMs);
    } catch (error) {
      const failure = toBleError(error, 'connect');
      markOpenSettled();
      const closing = this.close(this.state === 'closed' ? this.closeReason : 'error');
      // Report the failure at once. The endpoint stays busy (retryable) until a still-running transport connect
      // returned and its late link was released; otherwise the session is fully closed before we reject.
      if (!this.connectPending) await closing;
      throw failure;
    } finally {
      this.rejectConnect = null;
    }
    if (this.state === 'closed') {
      await this.release(link);
      markOpenSettled();
      await this.closing;
      throw closeError(this.closeReason, 'connect');
    }
    this.link = link;
    this.linkMtu = normalizeMtu(link.mtu);
    this.state = 'open';
    this.cancelLease = this.deps.clock.setTimeout(() => void this.close('lease-expired'), options.leaseMs);
    try {
      link.onDisconnected?.((detail) => this.linkLost(detail));
    } catch (error) {
      markOpenSettled();
      await this.close('error');
      throw toBleError(error, 'connect');
    }
    markOpenSettled();
  }

  private connect(timeoutMs: number): Promise<BleSessionLink> {
    return new Promise<BleSessionLink>((resolve, reject) => {
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
      }, timeoutMs);
      this.connectPending = true;
      this.connectWork = attempt(() => this.deps.connect(this.connectController.signal, timeoutMs))
        .then(
          (value): Promise<void> | void => {
            cancelTimer();
            // A link that arrives after the connect already failed must not be leaked.
            if (settled) return this.release(value).then(() => void (this.connectPending = false));
            this.connectPending = false;
            settled = true;
            resolve(value);
          },
          (error) => {
            cancelTimer();
            this.connectPending = false;
            if (!settled) fail(toBleError(error, 'connect'));
          },
        )
        .catch(() => undefined);
    });
  }

  /** Disconnects a link; never rejects and never waits longer than the disconnect deadline. */
  private release(link: BleSessionLink): Promise<void> {
    return new Promise<void>((resolve) => {
      const cancelTimer = this.deps.clock.setTimeout(resolve, DISCONNECT_DEADLINE_MS);
      attempt(() => link.disconnect())
        .catch(() => undefined)
        .then(() => (cancelTimer(), resolve()));
    });
  }

  /** Waits for `work`, but never longer than the disconnect deadline. */
  private bounded(work: Promise<void>): Promise<void> {
    return new Promise<void>((resolve) => {
      const cancelTimer = this.deps.clock.setTimeout(resolve, DISCONNECT_DEADLINE_MS);
      void work.then(() => (cancelTimer(), resolve()));
    });
  }

  /** Called by the transport when the link was lost. */
  linkLost(detail?: string): void {
    if (!this.closing) this.lostDetail = typeof detail === 'string' ? detail : undefined;
    void this.close('disconnected');
  }

  close(reason: PluginBleCloseReason = 'closed'): Promise<void> {
    if (this.closing) return this.closing;
    let finish!: () => void;
    // Set first, so a close triggered from inside this one (e.g. a driver reporting the link lost) is a no-op.
    this.closing = new Promise<void>((resolve) => (finish = resolve));
    this.state = 'closed';
    this.closeReason = reason;
    this.cancelLease?.();
    this.detachOpenSignal?.();
    this.connectController.abort();
    this.rejectConnect?.(closeError(reason, 'connect'));
    for (const operation of [...this.active]) {
      operation.controller.abort();
      operation.fail(closeError(reason, 'operation', this.lostDetail));
    }
    for (const { stream } of this.subscriptions.values()) stream.end(closeError(reason, 'subscribe'));
    for (const stream of this.starting.values()) stream.end(closeError(reason, 'subscribe'));
    this.subscriptions.clear();
    this.starting.clear();
    this.subscribing.clear();
    const link = this.link;
    this.link = null;
    void (async () => {
      if (link && reason !== 'disconnected') await this.release(link);
      await this.openSettled;
      await this.bounded(this.connectWork);
    })().then(() => {
      // Only now is the endpoint free again, so a reopen never overlaps the old link's disconnect.
      try {
        this.deps.onClosed(this);
      } catch {
        // A failing callback must not keep the session from closing.
      } finally {
        this.resolveClosed({ reason });
        finish();
      }
    });
    return this.closing;
  }

  read(key: string, options: PluginBleCallOptions = {}): Promise<Uint8Array> {
    return this.run('read', options, () => {
      const target = prepareBleRead(this.deps.profile, key);
      return async (signal, link, timeoutMs) => {
        const value = await link.read({
          serviceUuid: target.serviceUuid,
          characteristicUuid: target.characteristic.uuid,
          signal,
          timeoutMs,
        });
        return checkBleInboundPayload(target.characteristic, 'read', value);
      };
    });
  }

  write(key: string, value: Uint8Array, options: PluginBleWriteOptions = {}): Promise<void> {
    return this.run('write', options, () => {
      const prepared = prepareBleWrite(this.deps.profile, key, value, options.withoutResponse === true);
      // A write without response travels in one ATT packet: three bytes of it are the ATT header.
      if (prepared.withoutResponse && prepared.value.byteLength > this.linkMtu - 3) {
        throw new PluginBleError(
          'PAYLOAD_TOO_LARGE',
          `A write without response to "${prepared.characteristic.key}" exceeds the MTU payload of ${this.linkMtu - 3} bytes`,
          { operation: 'write', detail: 'exceeds-mtu' },
        );
      }
      return (signal, link, timeoutMs) =>
        link.write({
          serviceUuid: prepared.serviceUuid,
          characteristicUuid: prepared.characteristic.uuid,
          value: prepared.value,
          withoutResponse: prepared.withoutResponse,
          signal,
          timeoutMs,
        });
    });
  }

  subscribe(key: string, options: { signal?: AbortSignal } = {}): Promise<PluginBleNotificationStream> {
    let reserved = false;
    const result = this.run('subscribe', options, () => {
      const target = prepareBleSubscribe(this.deps.profile, key);
      if (this.subscriptions.has(key) || this.subscribing.has(key)) {
        throw new PluginBleError('INVALID_ARGUMENT', `"${key}" is already subscribed`, { operation: 'subscribe' });
      }
      this.subscribing.add(key);
      reserved = true;
      return (signal, link, timeoutMs) => this.startSubscription(key, target, signal, link, timeoutMs);
    });
    if (reserved) {
      const release = () => void this.subscribing.delete(key);
      result.then(release, release);
    }
    return result;
  }

  private async startSubscription(
    key: string,
    target: ReturnType<typeof prepareBleSubscribe>,
    signal: AbortSignal,
    link: BleSessionLink,
    timeoutMs: number,
  ): Promise<PluginBleNotificationStream> {
    const stream: BleNotificationStream = new BleNotificationStream(
      key,
      this.deps.profile.limits.maxNotificationQueue,
      this.deps.clock,
      () => this.unsubscribeStream(key, stream),
    );
    const ref = { serviceUuid: target.serviceUuid, characteristicUuid: target.characteristic.uuid };
    // Registered only once the link confirmed it, so a timed-out subscribe never blocks a retry.
    this.starting.set(key, stream);
    try {
      await link.subscribe({
        ...ref,
        indicate: target.indicate,
        signal,
        timeoutMs,
        onNotification: (bytes) => this.deliver(key, stream, target, bytes),
        onError: (error) => this.failStream(key, stream, target, toBleError(error, 'subscribe')),
      });
    } finally {
      if (this.starting.get(key) === stream) this.starting.delete(key);
    }
    if (signal.aborted || this.state !== 'open') {
      // Timed out or cancelled while the link call ran: nobody holds this stream. Undo it on the link unless a
      // newer subscribe for the key already took over.
      stream.end(cancelled('next'));
      if (this.link === link && !this.subscriptions.has(key) && !this.starting.has(key)) await link.unsubscribe(ref);
      throw cancelled('subscribe');
    }
    // A stream that already failed (overflow during the start) was torn down on the link by `deliver`.
    if (!stream.ended) this.subscriptions.set(key, { stream, target });
    return stream.handle;
  }

  unsubscribe(key: string): Promise<void> {
    return this.run('unsubscribe', {}, () => {
      // Unknown or non-notifying keys are rejected; a valid key without a subscription is a no-op.
      prepareBleSubscribe(this.deps.profile, key);
      // Looked up when the operation runs, so it applies to a subscribe queued before it.
      return (_signal, link) => this.teardown(key, null, link);
    });
  }

  private unsubscribeStream(key: string, stream: BleNotificationStream): Promise<void> {
    if (this.state !== 'open') return Promise.resolve();
    return this.run('unsubscribe', {}, () => (_signal, link) => this.teardown(key, stream, link));
  }

  /** Removes the subscription of `key` (only if it is `only`, when given) and tells the link. */
  private async teardown(key: string, only: BleNotificationStream | null, link: BleSessionLink | null): Promise<void> {
    const subscription = this.subscriptions.get(key);
    if (!subscription || (only && subscription.stream !== only)) return;
    this.subscriptions.delete(key);
    subscription.stream.end(cancelled('next'));
    await link?.unsubscribe({
      serviceUuid: subscription.target.serviceUuid,
      characteristicUuid: subscription.target.characteristic.uuid,
    });
  }

  private deliver(key: string, stream: BleNotificationStream, target: Target, bytes: Uint8Array): void {
    if (!this.owns(key, stream)) return;
    const wasEnded = stream.ended;
    try {
      stream.push(checkBleInboundPayload(target.characteristic, 'notification', bytes));
    } catch (error) {
      stream.end(toBleError(error, 'subscribe'));
    }
    const failure = stream.failure;
    if (!wasEnded && failure) {
      try {
        this.deps.onStreamFailed?.(failure.code, failure.detail);
      } catch {
        // Reporting never changes the outcome of a stream.
      }
    }
    this.dropIfEnded(key, stream, target);
  }

  private owns(key: string, stream: BleNotificationStream): boolean {
    return this.subscriptions.get(key)?.stream === stream || this.starting.get(key) === stream;
  }

  private failStream(key: string, stream: BleNotificationStream, target: Target, error: PluginBleError): void {
    if (!this.owns(key, stream)) return;
    stream.end(error);
    this.dropIfEnded(key, stream, target);
  }

  private dropIfEnded(key: string, stream: BleNotificationStream, target: Target): void {
    if (stream.ended) {
      this.subscriptions.delete(key);
      // Overflow tears the subscription down on the link as well.
      const link = this.link;
      if (link) {
        const ref = { serviceUuid: target.serviceUuid, characteristicUuid: target.characteristic.uuid };
        void attempt(() => link.unsubscribe(ref)).catch(() => undefined);
      }
    }
  }

  /**
   * Queues one operation. `prepare` validates synchronously (before anything is queued or reaches the link) and
   * returns the function that talks to the link.
   */
  private run<T>(
    operation: string,
    options: { signal?: AbortSignal; timeoutMs?: number },
    prepare: () => Executor<T>,
  ): Promise<T> {
    let execute: Executor<T>;
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
      try {
        this.deps.onRejected?.(operation, toBleError(error, operation));
      } catch {
        // Reporting never changes the outcome of a call.
      }
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      let cancelTimer: (() => void) | undefined;
      let finished!: () => void;
      const done = new Promise<void>((resolveDone) => (finished = resolveDone));
      const startedAt = this.deps.clock.now();
      const op: ActiveOperation = {
        settled: false,
        controller: new AbortController(),
        fail: (error) => settle(() => reject(error), error.code, error.detail),
      };
      const settle = (complete: () => void, outcome: string, detail?: string) => {
        if (op.settled) return;
        op.settled = true;
        cancelTimer?.();
        options.signal?.removeEventListener('abort', onAbort);
        this.active.delete(op);
        finished();
        complete();
        try {
          this.deps.log?.(operation, outcome, this.deps.clock.now() - startedAt, detail);
        } catch {
          // Logging never changes the outcome of an operation.
        }
      };
      const onAbort = () => {
        op.controller.abort();
        op.fail(cancelled(operation));
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.active.add(op);
      const step = async () => {
        const link = this.link;
        if (op.settled || !link) return;
        cancelTimer = this.deps.clock.setTimeout(() => {
          op.controller.abort();
          op.fail(new PluginBleError('TIMEOUT', `${operation} timed out`, { operation }));
        }, timeoutMs);
        const call = attempt(() => execute(op.controller.signal, link, timeoutMs)).then(
          (value) => settle(() => resolve(value), 'ok'),
          (error) => {
            const failure = toBleError(error, operation);
            // The driver reporting a lost link ends the session; timeouts and cancellations do not.
            if (failure.code === 'DISCONNECTED') void this.close('disconnected');
            op.fail(failure);
          },
        );
        // A timed-out or cancelled operation must not block the queue behind a hung link call.
        await Promise.race([call, done]);
      };
      // The catch keeps the chain usable whatever happens in a step.
      this.tail = this.tail.then(step).catch(() => undefined);
    });
  }
}
