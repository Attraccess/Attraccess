import { PLUGIN_BLE_LIMITS, PluginBleError } from '@attraccess/plugins-backend-sdk';
import type {
  BleAllowlistEntry,
  BleCallContext,
  BleDriverLink,
} from '../../../../plugin-system/ble/ble-transport-driver';
import { AttractapEventType } from '../../websocket.types';
import type { ReaderBleChannel, ReaderBleChannelDeps, WirePayload } from './reader-ble-channel';
import { bleWireError, decodeBleBytes, encodeBleBytes } from './ble-wire';

/** Every request carries its deadline; a call without one (unsubscribe) gets the default. */
const opTimeout = (timeoutMs: number | undefined) => timeoutMs ?? PLUGIN_BLE_LIMITS.opTimeoutDefaultMs;

/** Writes without response the API sends ahead of the reader's results. */
export const BLE_WRITE_WINDOW = 8;

interface Subscription {
  id: number;
  characteristicUuid: string;
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
    for (const entry of request.allowlist) this.allowlist.set(entry.characteristicUuid, entry);
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
    const max = this.allowlist.get(request.characteristicUuid)?.maxReadBytes ?? 0;
    const value = decodeBleBytes(payload.value ?? '', max);
    if (!value) {
      this.deps.metrics?.rejections.inc({ code: 'PAYLOAD_TOO_LARGE' });
      throw new PluginBleError('PAYLOAD_TOO_LARGE', 'The reader returned a malformed or oversized read result', {
        operation: 'read',
        detail: 'malformed-result',
      });
    }
    return value;
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
    this.dropSubscriptionOf(request.characteristicUuid);
    this.subscriptions.set(call.requestId, {
      id: call.requestId,
      characteristicUuid: request.characteristicUuid,
      nextSeq: 1,
      maxBytes: this.allowlist.get(request.characteristicUuid)?.maxNotificationBytes ?? 0,
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

  async unsubscribe(request: Parameters<BleDriverLink['unsubscribe']>[0]): Promise<void> {
    this.dropSubscriptionOf(request.characteristicUuid);
    if (this.state !== 'open') return;
    await this.call(
      AttractapEventType.BLE_UNSUBSCRIBE,
      { s: request.serviceUuid, c: request.characteristicUuid, timeoutMs: opTimeout(request.timeoutMs) },
      'unsubscribe',
      request,
    );
  }

  async disconnect(): Promise<void> {
    if (this.state !== 'open') return;
    this.state = 'closing';
    this.failWindowWaiters(new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation: 'write' }));
    this.subscriptions.clear();
    const deferred = this.deferredError;
    if (deferred) {
      const outcome = deferred.code;
      const diagnostic = deferred.detail ?? '-';
      this.deps.logger.log(
        `ble pipelined write failed before close ${this.scope} outcome=${outcome} detail=${diagnostic}`,
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
    if (payload.seq !== subscription.nextSeq) {
      return this.failSubscription(subscription, 'malformed', 'INTERNAL', 'malformed-notification');
    }
    subscription.nextSeq++;
    if (payload.error !== undefined) {
      const error = bleWireError(payload.error, 'subscribe');
      const outcome = error.code === 'NOTIFICATION_OVERFLOW' ? 'overflow' : 'oversized';
      return this.failSubscription(subscription, outcome, error.code, error.detail);
    }
    const value = decodeBleBytes(payload.value, subscription.maxBytes);
    if (!value) return this.failSubscription(subscription, 'oversized', 'PAYLOAD_TOO_LARGE', 'notification');
    this.deps.metrics?.notifications.inc({ outcome: 'delivered' });
    subscription.onNotification(value);
  }

  private failSubscription(
    subscription: Subscription,
    outcome: 'overflow' | 'oversized' | 'malformed',
    code: PluginBleError['code'],
    detail?: string,
  ): void {
    this.subscriptions.delete(subscription.id);
    this.deps.metrics?.notifications.inc({ outcome });
    const failure = code;
    this.deps.logger.log(`ble notification stream failed ${this.scope} outcome=${failure} detail=${detail ?? outcome}`);
    subscription.onError?.(
      new PluginBleError(code, `The notification stream failed (${outcome})`, { operation: 'subscribe', detail }),
    );
  }

  private dropSubscriptionOf(characteristicUuid: string): void {
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.characteristicUuid === characteristicUuid) this.subscriptions.delete(id);
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
