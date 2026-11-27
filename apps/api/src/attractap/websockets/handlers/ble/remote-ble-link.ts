import { PLUGIN_BLE_LIMITS, PluginBleError } from '@attraccess/plugins-backend-sdk';
import type { ClusterBus } from '../../../../cluster/cluster.types';
import { deserializeClusterError, type SerializedClusterError } from '../../../../cluster/cluster-errors';
import type { BleDriverLink } from '../../../../plugin-system/ble/ble-transport-driver';
import {
  BLE_CLUSTER_GRACE_MS,
  BleClusterMessage,
  callHolder,
  decodeBytes,
  encodeBytes,
  isHolderGone,
  READER_LINK_LOST,
} from './ble-cluster-wire';

const opTimeout = (timeoutMs: number | undefined) => timeoutMs ?? PLUGIN_BLE_LIMITS.opTimeoutDefaultMs;
/** The holder's close waits for the reader up to 5 s. */
const DISCONNECT_TIMEOUT_MS = 5_000 + BLE_CLUSTER_GRACE_MS;

interface RemoteSubscription {
  key: string;
  onNotification(value: Uint8Array): void;
  onError?(error: PluginBleError): void;
}

/**
 * A session whose reader is held by another API instance: one bus request per operation, answered there by the
 * reader's own link. Notifications and the link's loss come back as addressed messages. Losing the holder (its
 * heartbeat lapsed) loses the link with `reader-link-lost`, like a closed reader socket.
 */
export class RemoteBleLink implements BleDriverLink {
  private state: 'open' | 'closing' | 'lost' = 'open';
  private lostDetail: string | undefined;
  private readonly listeners: Array<(detail?: string) => void> = [];
  private readonly subscriptions = new Map<number, RemoteSubscription>();
  private readonly pending = new Set<(error: PluginBleError) => void>();
  private nextSubscriptionId = 0;

  constructor(
    private readonly bus: ClusterBus,
    readonly holder: string,
    readonly linkId: string,
    readonly readerId: number,
    readonly mtu: number,
    /** The link is over (closed or lost): the router forgets it. */
    private readonly onFinished: (link: RemoteBleLink) => void,
  ) {}

  get isOpen(): boolean {
    return this.state === 'open';
  }

  onDisconnected(listener: (detail?: string) => void): void {
    if (this.state === 'lost') listener(this.lostDetail);
    else this.listeners.push(listener);
  }

  async read(request: Parameters<BleDriverLink['read']>[0]): Promise<Uint8Array> {
    const { serviceUuid, characteristicUuid, timeoutMs } = request;
    const value = await this.call<string>(
      'read',
      { serviceUuid, characteristicUuid, timeoutMs: opTimeout(timeoutMs) },
      request.signal,
    );
    return decodeBytes(value);
  }

  async write(request: Parameters<BleDriverLink['write']>[0]): Promise<void> {
    const { serviceUuid, characteristicUuid, withoutResponse, timeoutMs } = request;
    // A write without response resolves on the holder once queued there, so this costs one bus round trip.
    await this.call(
      'write',
      {
        serviceUuid,
        characteristicUuid,
        withoutResponse,
        value: encodeBytes(request.value),
        timeoutMs: opTimeout(timeoutMs),
      },
      request.signal,
    );
  }

  async subscribe(request: Parameters<BleDriverLink['subscribe']>[0]): Promise<void> {
    const { serviceUuid, characteristicUuid, indicate, timeoutMs } = request;
    const key = `${serviceUuid}/${characteristicUuid}`;
    this.throwIfUnusable('subscribe');
    // Registered before the request: the holder may forward notifications before its answer.
    this.dropSubscriptionOf(key);
    const subscriptionId = ++this.nextSubscriptionId;
    this.subscriptions.set(subscriptionId, { key, onNotification: request.onNotification, onError: request.onError });
    try {
      await this.call(
        'subscribe',
        { serviceUuid, characteristicUuid, indicate, subscriptionId, timeoutMs: opTimeout(timeoutMs) },
        request.signal,
      );
    } catch (error) {
      this.subscriptions.delete(subscriptionId);
      throw error;
    }
  }

  async unsubscribe(request: Parameters<BleDriverLink['unsubscribe']>[0]): Promise<void> {
    const { serviceUuid, characteristicUuid } = request;
    this.dropSubscriptionOf(`${serviceUuid}/${characteristicUuid}`);
    if (this.state !== 'open') return;
    await this.call('unsubscribe', { serviceUuid, characteristicUuid, timeoutMs: opTimeout(request.timeoutMs) });
  }

  async disconnect(): Promise<void> {
    if (this.state !== 'open') return;
    this.state = 'closing';
    this.subscriptions.clear();
    this.onFinished(this);
    await callHolder(this.bus, {
      holder: this.holder,
      type: BleClusterMessage.LINK,
      payload: { linkId: this.linkId, op: 'disconnect' },
      operation: 'disconnect',
      timeoutMs: DISCONNECT_TIMEOUT_MS,
    }).catch(() => undefined);
  }

  /** The holder lost the link, or the holder itself is gone: everything pending fails, listeners run once. */
  lost(detail = READER_LINK_LOST): void {
    if (this.state === 'lost') return;
    const wasOpen = this.state === 'open';
    this.state = 'lost';
    this.lostDetail = detail;
    this.subscriptions.clear();
    this.onFinished(this);
    for (const fail of [...this.pending])
      fail(new PluginBleError('DISCONNECTED', 'The device disconnected', { detail }));
    this.pending.clear();
    if (!wasOpen) return;
    for (const listener of this.listeners.splice(0)) {
      try {
        listener(detail);
      } catch {
        // A listener must not keep the others from running.
      }
    }
  }

  handleNotification(subscriptionId: number, value: string): void {
    this.subscriptions.get(subscriptionId)?.onNotification(decodeBytes(value));
  }

  handleNotificationError(subscriptionId: number, error: SerializedClusterError): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    this.subscriptions.delete(subscriptionId);
    const failure = deserializeClusterError(error);
    subscription.onError?.(
      failure instanceof PluginBleError
        ? failure
        : new PluginBleError('INTERNAL', 'The notification stream failed', { operation: 'subscribe' }),
    );
  }

  private dropSubscriptionOf(key: string): void {
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.key === key) this.subscriptions.delete(id);
    }
  }

  private throwIfUnusable(operation: string): void {
    if (this.state === 'lost') {
      throw new PluginBleError('DISCONNECTED', 'The device disconnected', { operation, detail: this.lostDetail });
    }
    if (this.state !== 'open') throw new PluginBleError('SESSION_CLOSED', 'The session is closed', { operation });
  }

  /** One operation on the holder; it fails at once when the link is lost meanwhile. */
  private call<T>(
    op: string,
    payload: Record<string, unknown> & { timeoutMs: number },
    signal?: AbortSignal,
  ): Promise<T> {
    this.throwIfUnusable(op);
    return new Promise<T>((resolve, reject) => {
      const fail = (error: PluginBleError) =>
        reject(new PluginBleError(error.code, error.message, { operation: op, detail: error.detail }));
      this.pending.add(fail);
      callHolder<T>(this.bus, {
        holder: this.holder,
        type: BleClusterMessage.LINK,
        payload: { ...payload, linkId: this.linkId, op },
        operation: op,
        timeoutMs: payload.timeoutMs + BLE_CLUSTER_GRACE_MS,
        signal,
        // The holder is gone, or it no longer serves the link (its loss message may have been missed).
        onFailure: (error) => {
          const lostThere = error instanceof PluginBleError && error.detail === READER_LINK_LOST;
          if (isHolderGone(error) || lostThere) this.lost();
        },
      })
        .then(resolve, reject)
        .finally(() => this.pending.delete(fail));
    });
  }
}
