import { PLUGIN_BLE_LIMITS, PluginBleError } from '@attraccess/plugins-backend-sdk';
import { bleStreamOutcome } from '../../../../metrics/definitions/plugin-ble.metrics';
import type {
  BleAllowlistEntry,
  BleCallContext,
  BleDriverLink,
} from '../../../../plugin-system/ble/ble-transport-driver';
import { AttractapEventType } from '../../websocket.types';
import type { ReaderBleChannel, ReaderBleChannelDeps, WirePayload } from './reader-ble-channel';
import { bleWireError, encodeBleBytes, readBleBytes } from './ble-wire';

/** Every request carries its deadline; a call without one (unsubscribe) gets the default. */
const opTimeout = (timeoutMs: number | undefined) => timeoutMs ?? PLUGIN_BLE_LIMITS.opTimeoutDefaultMs;

/** Writes without response the API sends ahead of the reader's results. */
export const BLE_WRITE_WINDOW = 8;

/** A characteristic UUID may appear in several services: the reader and the API key characteristics by both. */
const characteristicKey = (ref: { serviceUuid: string; characteristicUuid: string }) =>
  `${ref.serviceUuid}/${ref.characteristicUuid}`;

type StreamOutcome = ReturnType<typeof bleStreamOutcome>;

interface Subscription {
  id: number;
  /** `characteristicKey` of the subscribed characteristic. */
  key: string;
  nextSeq: number;
  maxBytes: number;
  onNotification(value: Uint8Array): void;
  onError?(error: PluginBleError): void;
}

/** One open session on the reader, as the session engine sees it. */
export class ReaderBleLink implements BleDriverLink {
  private state: 'open' | 'closing' | 'lost' = 'open';
  private readonly listeners: Array<(detail?: string) => void> = [];
  private readonly subscriptions = new Map<number, Subscription>();
  private readonly allowlist = new Map<string, BleAllowlistEntry>();
  private windowInFlight = 0;
  private readonly windowWaiters: Array<{ grant(): void; fail(error: PluginBleError): void }> = [];
  /** A write without response failed on the reader after it resolved here: the next call reports it. */
  private deferredError: PluginBleError | null = null;
  private lostDetail: string | undefined;
  private readonly scope: string;

  constructor(
    private readonly channel: ReaderBleChannel,
    readonly sessionId: string,
    readonly mtu: number,
    request: { allowlist: BleAllowlistEntry[]; context: BleCallContext; readerId: number },
    private readonly deps: ReaderBleChannelDeps,
  ) {
    for (const entry of request.allowlist) this.allowlist.set(characteristicKey(entry), entry);
    const { pluginId, endpointId, profileId } = request.context;
    this.scope = `reader=${request.readerId} endpoint=${endpointId} plugin=${pluginId} profile=${profileId} session=${sessionId}`;
  }

  onDisconnected(listener: (detail?: string) => void): void {
    if (this.state === 'lost') listener(this.lostDetail);
    else this.listeners.push(listener);
  }

  async read(request: Parameters<BleDriverLink['read']>[0]): Promise<Uint8Array> {
    const payload = await this.call(
      AttractapEventType.BLE_READ,
      { s: request.serviceUuid, c: request.characteristicUuid, timeoutMs: opTimeout(request.timeoutMs) },
      'read',
      request,
    );
    const max = this.allowlist.get(characteristicKey(request))?.maxReadBytes ?? 0;
    const value = readBleBytes(payload.value, max);
    if ('bytes' in value) return value.bytes;
    // Counted as a rejection by the session's operation log, like every PAYLOAD_TOO_LARGE.
    if (value.error === 'oversized') {
      throw new PluginBleError('PAYLOAD_TOO_LARGE', 'The reader returned a read result above the bound', {
        operation: 'read',
        detail: 'max-read',
      });
    }
    throw new PluginBleError('INTERNAL', 'The reader returned a malformed read result', {
      operation: 'read',
      detail: 'malformed-result',
    });
  }

  async write(request: Parameters<BleDriverLink['write']>[0]): Promise<void> {
    const payload = {
      s: request.serviceUuid,
      c: request.characteristicUuid,
      value: encodeBleBytes(request.value),
      withoutResponse: request.withoutResponse,
      timeoutMs: opTimeout(request.timeoutMs),
    };
    if (!request.withoutResponse) {
      await this.call(AttractapEventType.BLE_WRITE, payload, 'write', request);
      return;
    }
    // Pipelined: resolved once queued on the reader link, in order; the reader's result frees the window slot.
    this.throwIfUnusable('write');
    await this.windowSlot(request.signal);
    let result: Promise<unknown>;
    try {
      this.throwIfUnusable('write');
      ({ result } = this.channel.request(AttractapEventType.BLE_WRITE, this.sessionId, payload, 'write', {
        timeoutMs: opTimeout(request.timeoutMs),
      }));
    } catch (error) {
      this.freeSlot();
      throw error;
    }
    result.then(
      () => this.freeSlot(),
      (error: PluginBleError) => {
        this.freeSlot();
        if (this.state === 'open' && error.code !== 'CANCELLED') this.deferredError ??= error;
      },
    );
  }

  async subscribe(request: Parameters<BleDriverLink['subscribe']>[0]): Promise<void> {
    this.throwIfUnusable('subscribe');
    const call = this.channel.request(
      AttractapEventType.BLE_SUBSCRIBE,
      this.sessionId,
      {
        s: request.serviceUuid,
        c: request.characteristicUuid,
        indicate: request.indicate,
        timeoutMs: opTimeout(request.timeoutMs),
      },
      'subscribe',
      { signal: request.signal, timeoutMs: opTimeout(request.timeoutMs) },
    );
    // Registered before the answer: the reader may notify right after it wrote the CCCD.
    const key = characteristicKey(request);
    this.dropSubscriptionOf(key);
    this.subscriptions.set(call.requestId, {
      id: call.requestId,
      key,
      nextSeq: 1,
      maxBytes: this.allowlist.get(key)?.maxNotificationBytes ?? 0,
      onNotification: request.onNotification,
      onError: request.onError,
    });
    try {
      await call.result;
    } catch (error) {
      this.subscriptions.delete(call.requestId);
      throw error;
    }
  }

  /**
   * Also called by the session engine outside the plugin's operations (a failed stream is torn down), so it never
   * reports, or consumes, the failure of a pipelined write: that belongs to the plugin's next call.
   */
  async unsubscribe(request: Parameters<BleDriverLink['unsubscribe']>[0]): Promise<void> {
    this.dropSubscriptionOf(characteristicKey(request));
    if (this.state !== 'open') return;
    const timeoutMs = opTimeout(request.timeoutMs);
    await this.channel.request(
      AttractapEventType.BLE_UNSUBSCRIBE,
      this.sessionId,
      { s: request.serviceUuid, c: request.characteristicUuid, timeoutMs },
      'unsubscribe',
      { timeoutMs },
    ).result;
  }

  async disconnect(): Promise<void> {
    if (this.state !== 'open') return;
    this.state = 'closing';
    this.failWindowWaiters(new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation: 'write' }));
    this.subscriptions.clear();
    const deferred = this.deferredError;
    if (deferred) {
      // Nobody called again after the failure: the log is the only place it shows up.
      const outcome = deferred.code;
      this.deps.logger.log(
        `ble pipelined write failed before close ${this.scope} outcome=${outcome} detail=${deferred.detail ?? '-'}`,
      );
    }
    await this.channel.closeOnReader(this.sessionId);
  }

  /** The reader ended the session (peripheral gone, lease, OTA) or the socket closed. */
  lost(reason: string, detail?: string): void {
    if (this.state === 'lost') return;
    const wasOpen = this.state === 'open';
    this.state = 'lost';
    this.lostDetail = detail ?? reason;
    this.subscriptions.clear();
    this.failWindowWaiters(
      new PluginBleError('DISCONNECTED', 'The device disconnected', { operation: 'write', detail: detail ?? reason }),
    );
    this.channel.release(this.sessionId, detail ?? reason);
    if (!wasOpen) return;
    for (const listener of this.listeners.splice(0)) {
      try {
        listener(this.lostDetail);
      } catch {
        // A listener must not keep the others from running.
      }
    }
  }

  handleNotification(payload: WirePayload): void {
    const subscription =
      typeof payload.subscriptionId === 'number' ? this.subscriptions.get(payload.subscriptionId) : undefined;
    if (!subscription) {
      this.deps.logger.debug?.(`ble dropped notification ${this.scope}: no such subscription`);
      return;
    }
    // A missing, non-integer or out-of-order seq: the stream can no longer be trusted to be complete.
    if (payload.seq !== subscription.nextSeq) {
      return this.failSubscription(subscription, 'malformed', 'INTERNAL', 'malformed-notification');
    }
    subscription.nextSeq++;
    if (payload.error !== undefined) {
      const error = bleWireError(payload.error, 'subscribe');
      return this.failSubscription(subscription, bleStreamOutcome(error.code), error.code, error.detail);
    }
    const value = readBleBytes(payload.value, subscription.maxBytes);
    if ('bytes' in value) {
      this.deps.metrics?.notifications.inc({ outcome: 'delivered' });
      return subscription.onNotification(value.bytes);
    }
    if (value.error === 'oversized') {
      return this.failSubscription(subscription, 'oversized', 'PAYLOAD_TOO_LARGE', 'max-notification');
    }
    this.failSubscription(subscription, 'malformed', 'INTERNAL', 'malformed-notification');
  }

  private failSubscription(
    subscription: Subscription,
    outcome: StreamOutcome,
    errorCode: PluginBleError['code'],
    detail?: string,
  ): void {
    this.subscriptions.delete(subscription.id);
    this.deps.metrics?.notifications.inc({ outcome });
    this.deps.logger.log(
      `ble notification stream failed ${this.scope} outcome=${outcome} code=${errorCode} detail=${detail ?? '-'}`,
    );
    subscription.onError?.(
      new PluginBleError(errorCode, `The notification stream failed (${outcome})`, { operation: 'subscribe', detail }),
    );
  }

  private dropSubscriptionOf(key: string): void {
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.key === key) this.subscriptions.delete(id);
    }
  }

  private throwIfUnusable(operation: string): void {
    if (this.state === 'lost') {
      throw new PluginBleError('DISCONNECTED', 'The device disconnected', { operation });
    }
    if (this.state !== 'open') throw new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation });
    const deferred = this.deferredError;
    if (deferred) {
      this.deferredError = null;
      throw deferred;
    }
  }

  private async call(
    type: AttractapEventType,
    payload: WirePayload,
    operation: string,
    request: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<WirePayload> {
    this.throwIfUnusable(operation);
    return this.channel.request(type, this.sessionId, payload, operation, {
      signal: request.signal,
      timeoutMs: opTimeout(request.timeoutMs),
    }).result;
  }

  private windowSlot(signal: AbortSignal): Promise<void> {
    if (this.windowInFlight < BLE_WRITE_WINDOW) {
      this.windowInFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        grant: () => {
          signal.removeEventListener('abort', onAbort);
          this.windowInFlight++;
          resolve();
        },
        fail: (error: PluginBleError) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      };
      const onAbort = () => {
        const index = this.windowWaiters.indexOf(waiter);
        if (index >= 0) this.windowWaiters.splice(index, 1);
        reject(new PluginBleError('CANCELLED', 'write was cancelled', { operation: 'write' }));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      this.windowWaiters.push(waiter);
    });
  }

  private freeSlot(): void {
    this.windowInFlight = Math.max(0, this.windowInFlight - 1);
    this.windowWaiters.shift()?.grant();
  }

  private failWindowWaiters(error: PluginBleError): void {
    for (const waiter of this.windowWaiters.splice(0)) waiter.fail(error);
  }
}
