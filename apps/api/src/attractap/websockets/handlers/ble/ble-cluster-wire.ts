import { PluginBleError, type PluginBleAdvertisement } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';
import type { ClusterBus } from '../../../../cluster/cluster.types';
import type { BleWatchDriverEvent } from '../../../../plugin-system/ble/ble-transport-driver';

/**
 * Plugin BLE between API instances (ATT-1163): the instance a plugin calls on (the origin) and the instance holding
 * the reader's newest websocket (the holder) talk over the cluster bus. Requests go origin → holder; notifications,
 * lost links and watch reports go holder → origin as addressed messages.
 */
export const BleClusterMessage = {
  /** Requests answered by the holder. */
  STATUS: 'ble.status',
  SCAN: 'ble.scan',
  CONNECT: 'ble.connect',
  LINK: 'ble.link',
  /** Origin → holder: abort the operation `opId` (the origin already rejected it). */
  CANCEL: 'ble.cancel',
  /** Origin → holder: this origin's watch filters for a reader (`filters: []` withdraws them). */
  WATCH_PART: 'ble.watch-part',
  /** Holder → origin. */
  NOTIFY: 'ble.notify',
  NOTIFY_ERROR: 'ble.notify-error',
  LINK_LOST: 'ble.link-lost',
  WATCH_STATE: 'ble.watch-state',
  WATCH_EVENTS: 'ble.watch-events',
} as const;

/** How long the origin waits for the holder beyond the operation's own deadline. */
export const BLE_CLUSTER_GRACE_MS = 5_000;
/** `readerStatus` must answer within the host's 5 s. */
export const BLE_CLUSTER_STATUS_TIMEOUT_MS = 4_000;
/** How often both sides check that the instance on the other end of a link or watch is still alive. */
export const BLE_CLUSTER_CHECK_EVERY_MS = 2_000;

export const READER_LINK_LOST = 'reader-link-lost';

export const encodeBytes = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
export const decodeBytes = (value: unknown): Uint8Array =>
  typeof value === 'string' ? new Uint8Array(Buffer.from(value, 'base64')) : new Uint8Array();

export interface WireAdvertisement extends Omit<PluginBleAdvertisement, 'manufacturerData'> {
  manufacturerData: Array<{ companyId: number; data: string }>;
}

export const encodeAdvertisement = (advertisement: PluginBleAdvertisement): WireAdvertisement => ({
  ...advertisement,
  manufacturerData: advertisement.manufacturerData.map((entry) => ({ ...entry, data: encodeBytes(entry.data) })),
});

export const decodeAdvertisement = (wire: WireAdvertisement): PluginBleAdvertisement => ({
  ...wire,
  manufacturerData: wire.manufacturerData.map((entry) => ({ ...entry, data: decodeBytes(entry.data) })),
});

export interface WireWatchEvent extends WireAdvertisement {
  filterIds: number[];
  changed: boolean;
  receivedAt: number;
}

export const encodeWatchEvent = (event: BleWatchDriverEvent): WireWatchEvent => ({
  ...encodeAdvertisement(event),
  filterIds: event.filterIds,
  changed: event.changed,
  receivedAt: event.receivedAt.getTime(),
});

export const decodeWatchEvent = (wire: WireWatchEvent): BleWatchDriverEvent => ({
  ...decodeAdvertisement(wire),
  filterIds: wire.filterIds,
  changed: wire.changed,
  receivedAt: new Date(wire.receivedAt),
});

export const readerLinkLost = (operation: string) =>
  new PluginBleError('DISCONNECTED', 'The reader connection was lost', { operation, detail: READER_LINK_LOST });

/** True when the holder is unreachable: its link and everything pending on it is gone. */
export const isHolderGone = (error: unknown) => (error as Error)?.name === 'ClusterInstanceGoneError';

/**
 * A failure as the plugin sees it: the holder's `PluginBleError` keeps its code; a holder that went away is a lost
 * reader link; a holder that did not answer in time a timeout.
 */
export function remoteBleError(error: unknown, operation: string): PluginBleError {
  if (error instanceof PluginBleError) return error;
  if (isHolderGone(error)) return readerLinkLost(operation);
  if ((error as Error)?.name === 'ClusterRequestTimeoutError') {
    return new PluginBleError('TIMEOUT', `The reader did not answer ${operation} in time`, {
      operation,
      detail: 'cluster-timeout',
    });
  }
  return new PluginBleError('INTERNAL', `${operation} failed on the instance holding the reader`, {
    operation,
    detail: 'cluster-error',
  });
}

export const cancelledError = (operation: string) =>
  new PluginBleError('CANCELLED', `${operation} was cancelled`, { operation });

/**
 * One request to the holder. An abort rejects at once and tells the holder to stop; an answer arriving after that
 * goes to `onLate` (a connect that succeeded anyway must be closed again).
 */
export function callHolder<T>(
  bus: ClusterBus,
  call: {
    holder: string;
    type: string;
    payload: Record<string, unknown>;
    operation: string;
    timeoutMs: number;
    signal?: AbortSignal;
    onLate?: (value: T) => void;
    /** Runs on every failure but an abort, before the caller sees it. */
    onFailure?: (error: unknown) => void;
  },
): Promise<T> {
  if (call.signal?.aborted) return Promise.reject(cancelledError(call.operation));
  const opId = randomUUID();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(cancelledError(call.operation));
      void bus.send(call.holder, BleClusterMessage.CANCEL, { opId });
    };
    call.signal?.addEventListener('abort', onAbort, { once: true });
    bus.request<T>(call.holder, call.type, { ...call.payload, opId }, call.timeoutMs).then(
      (value) => {
        call.signal?.removeEventListener('abort', onAbort);
        if (settled) return call.onLate?.(value);
        settled = true;
        resolve(value);
      },
      (error: unknown) => {
        call.signal?.removeEventListener('abort', onAbort);
        if (settled) return;
        settled = true;
        call.onFailure?.(error);
        reject(remoteBleError(error, call.operation));
      },
    );
  });
}
