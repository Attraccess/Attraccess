import type { PluginBleAdvertisement } from '@attraccess/plugins-backend-sdk';
import type { BleSessionClock } from '@attraccess/plugins-backend-sdk/internal';
import type { LoggerService } from '@nestjs/common';
import type { PluginBleMetrics, PluginBleWatchDropReason } from '../../../../metrics/definitions/plugin-ble.metrics';
import type {
  BleReaderStatus,
  BleTransportDriver,
  BleWatchDriverEvent,
  BleWatchFilter,
  BleWatchState,
} from '../../../../plugin-system/ble/ble-transport-driver';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import {
  BLE_FILTER_MAX_MANUFACTURER_IDS,
  BLE_FILTER_MAX_NAME_PREFIX_BYTES,
  BLE_FILTER_MAX_SERVICE_UUIDS,
  BLE_MAX_SERVER_FRAME_BYTES,
  BLE_PROTOCOL_VERSION,
  BLE_WATCH_MAX_EVENTS_PER_MESSAGE,
  BLE_WATCH_MAX_FILTERS,
  bleWireError,
  decodeBleAdvertisement,
  loggableInt,
  safeBleDetail,
  type BleWatchCapability,
} from './ble-wire';

type WatchRequest = Parameters<NonNullable<BleTransportDriver['setWatch']>>[0];
type WirePayload = Record<string, unknown>;

/** The API accepts this many times the announced event rate before it drops events of a reader. */
export const BLE_WATCH_RATE_SLACK = 2;
const RATE_WINDOW_MS = 1_000;

/** The set as it went to one reader connection. */
interface ActiveWatch {
  socket: AuthenticatedWebSocket;
  requestId: number;
  filterIds: Set<number>;
  maxEventsPerSecond: number;
  windowStart: number;
  windowCount: number;
}

export interface ReaderBleWatchDeps {
  clock(): BleSessionClock;
  logger(): LoggerService;
  metrics(): PluginBleMetrics | undefined;
  readerStatus(readerId: number): BleReaderStatus;
  currentSocket(readerId: number): AuthenticatedWebSocket | undefined;
}

function wireFilter(filter: BleWatchFilter) {
  const wire: WirePayload = {
    id: filter.id,
    manufacturerIds: filter.manufacturerIds,
    serviceUuids: filter.serviceUuids,
  };
  if (filter.namePrefix !== undefined) wire.namePrefix = filter.namePrefix;
  return wire;
}

function fitsReader(filter: BleWatchFilter): boolean {
  return (
    filter.serviceUuids.length <= BLE_FILTER_MAX_SERVICE_UUIDS &&
    filter.manufacturerIds.length <= BLE_FILTER_MAX_MANUFACTURER_IDS &&
    Buffer.byteLength(filter.namePrefix ?? '') <= BLE_FILTER_MAX_NAME_PREFIX_BYTES
  );
}

/**
 * The advertisement watch over the reader websocket (BLE_WATCH_SET / BLE_WATCH_STATE / BLE_WATCH_EVENT). It keeps
 * the wanted set per reader and sends it to the reader's current connection, again after every
 * READER_FIRMWARE_INFO. It never takes the connection's BLE owner: the reader watches beside scans and sessions.
 * Only events of the connection the set went to are accepted, validated and bounded before they reach the host.
 */
export class ReaderBleWatch {
  private readonly wanted = new Map<number, WatchRequest>();
  private readonly active = new Map<number, ActiveWatch>();
  private nextRequestId = 0;

  constructor(private readonly deps: ReaderBleWatchDeps) {}

  set(request: WatchRequest): void {
    if (request.filters.length > 0) {
      this.wanted.set(request.readerId, request);
      this.push(request.readerId);
      return;
    }
    this.wanted.delete(request.readerId);
    const active = this.active.get(request.readerId);
    this.active.delete(request.readerId);
    if (active) this.send(active.socket, [], request.keepaliveMs);
  }

  /** The reader announced itself on `socket` (READER_FIRMWARE_INFO): the set goes to this connection. */
  readerAnnounced(socket: AuthenticatedWebSocket): void {
    if (socket.readerId !== null && this.wanted.has(socket.readerId)) this.push(socket.readerId);
  }

  /** The connection the set went to is gone: the reader is offline until it announces itself again. */
  socketClosed(socket: AuthenticatedWebSocket): void {
    const readerId = socket.readerId;
    if (readerId === null || this.active.get(readerId)?.socket !== socket) return;
    this.active.delete(readerId);
    this.wanted.get(readerId)?.listener.onWatchState(readerId, { status: 'offline' });
  }

  private push(readerId: number): void {
    const request = this.wanted.get(readerId);
    if (!request) return;
    const state = this.sendSet(readerId, request);
    if (state.status !== 'watching') this.active.delete(readerId);
    request.listener.onWatchState(readerId, state);
  }

  private sendSet(readerId: number, request: WatchRequest): BleWatchState {
    const status = this.deps.readerStatus(readerId);
    if (status.status !== 'available') return status;
    const socket = this.deps.currentSocket(readerId);
    const ble = socket?.state.ble;
    if (!socket || !ble || !('capability' in ble)) return { status: 'offline' };
    const watch = ble.capability.watch;
    if ('detail' in watch) return { status: 'unsupported', detail: watch.detail };
    const { filters, excluded } = this.fit(request, watch.capability);
    const requestId = this.send(socket, filters, request.keepaliveMs);
    if (requestId === null) return { status: 'offline', detail: 'send-failed' };
    this.active.set(readerId, {
      socket,
      requestId,
      filterIds: new Set(filters.map((filter) => filter.id)),
      maxEventsPerSecond: watch.capability.maxEventsPerSecond,
      windowStart: this.deps.clock().now(),
      windowCount: 0,
    });
    this.deps
      .logger()
      .debug?.(
        `ble watch set sent reader=${readerId} client=${socket.id} request=${requestId} filters=${filters.length}` +
          ` excluded=${excluded.length}`,
      );
    return excluded.length > 0 ? { status: 'watching', excluded } : { status: 'watching' };
  }

  /** The filters the reader can take: its announced count, the firmware's per-filter limits and one frame. */
  private fit(request: WatchRequest, capability: BleWatchCapability) {
    const filters: BleWatchFilter[] = [];
    const excluded: Array<{ id: number; detail: string }> = [];
    for (const filter of request.filters) {
      if (!fitsReader(filter)) excluded.push({ id: filter.id, detail: 'filter-too-large' });
      else if (filters.length >= capability.maxFilters) excluded.push({ id: filter.id, detail: 'too-many-filters' });
      else filters.push(filter);
    }
    while (filters.length > 0 && this.frameBytes(filters, request.keepaliveMs) > BLE_MAX_SERVER_FRAME_BYTES) {
      excluded.push({ id: (filters.pop() as BleWatchFilter).id, detail: 'too-many-filters' });
    }
    return { filters, excluded };
  }

  private message(requestId: number, filters: BleWatchFilter[], keepaliveMs: number): AttractapEvent {
    return new AttractapEvent(AttractapEventType.BLE_WATCH_SET, {
      v: BLE_PROTOCOL_VERSION,
      requestId,
      filters: filters.map(wireFilter),
      keepaliveMs,
    });
  }

  private frameBytes(filters: BleWatchFilter[], keepaliveMs: number): number {
    return Buffer.byteLength(JSON.stringify(this.message(0x7fffffff, filters, keepaliveMs)));
  }

  /** Sends a set; the request id, or null when the socket refused it. */
  private send(socket: AuthenticatedWebSocket, filters: BleWatchFilter[], keepaliveMs: number): number | null {
    this.nextRequestId = (this.nextRequestId % 0x7fffffff) + 1;
    const requestId = this.nextRequestId;
    try {
      return socket.sendRaw(this.message(requestId, filters, keepaliveMs)) ? requestId : null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------- inbound

  handleState(socket: AuthenticatedWebSocket, payload: WirePayload): void {
    const readerId = socket.readerId;
    const active = readerId === null ? undefined : this.active.get(readerId);
    if (readerId === null || active?.socket !== socket) {
      this.deps.logger().debug?.(`ble dropped watch state reader=${socket.readerId} client=${socket.id}: no watch`);
      return;
    }
    if (payload.requestId === undefined) {
      const detail = safeBleDetail(payload.detail);
      this.deps
        .logger()
        .log(`ble watch reader=${readerId} active=${payload.active === true}${detail ? ` detail=${detail}` : ''}`);
      return;
    }
    if (payload.requestId !== active.requestId) {
      this.deps
        .logger()
        .debug?.(`ble dropped watch state reader=${readerId} request=${loggableInt(payload.requestId)}`);
      return;
    }
    if (payload.ok === true) return;
    const error = bleWireError(payload.error, 'watch');
    this.deps
      .logger()
      .warn(`ble watch refused by reader reader=${readerId} code=${error.code} detail=${error.detail ?? '-'}`);
    this.wanted.get(readerId)?.listener.onWatchState(readerId, {
      status: 'unsupported',
      detail: error.detail ?? error.code,
    });
  }

  handleEvents(socket: AuthenticatedWebSocket, payload: WirePayload): void {
    const readerId = socket.readerId;
    const active = readerId === null ? undefined : this.active.get(readerId);
    const request = readerId === null ? undefined : this.wanted.get(readerId);
    const raw = Array.isArray(payload.events) ? payload.events : null;
    if (!raw) return this.drop('malformed');
    if (readerId === null || !request || active?.socket !== socket) return this.drop('stale-connection', raw.length);
    if (raw.length > BLE_WATCH_MAX_EVENTS_PER_MESSAGE) {
      this.drop('batch-too-large', raw.length - BLE_WATCH_MAX_EVENTS_PER_MESSAGE);
    }
    const receivedAt = new Date(this.deps.clock().now());
    const events: BleWatchDriverEvent[] = [];
    for (const entry of raw.slice(0, BLE_WATCH_MAX_EVENTS_PER_MESSAGE)) {
      const decoded = decodeWatchEvent(entry, active.filterIds);
      if ('drop' in decoded) this.drop(decoded.drop);
      else if (!this.withinRate(active)) this.drop('rate-limit');
      else events.push({ ...decoded.event, receivedAt });
    }
    // Latency: compare this receive time with the device's own log or a HIL capture.
    this.deps
      .logger()
      .debug?.(
        `ble watch events reader=${readerId} client=${socket.id} accepted=${events.length}/${raw.length} ` +
          `receivedAt=${receivedAt.toISOString()}`,
      );
    if (events.length > 0) request.listener.onWatchEvents(readerId, events);
  }

  private withinRate(active: ActiveWatch): boolean {
    const now = this.deps.clock().now();
    if (now - active.windowStart >= RATE_WINDOW_MS) {
      active.windowStart = now;
      active.windowCount = 0;
    }
    active.windowCount++;
    return active.windowCount <= active.maxEventsPerSecond * BLE_WATCH_RATE_SLACK;
  }

  private drop(reason: PluginBleWatchDropReason, count = 1): void {
    if (count > 0) this.deps.metrics()?.watchEventsDropped.inc({ reason }, count);
  }
}

/** One BLE_WATCH_EVENT entry: the advertisement (as in BLE_SCAN_RESULT), its known filter ids and `changed`. */
function decodeWatchEvent(
  raw: unknown,
  known: Set<number>,
): { event: Omit<BleWatchDriverEvent, 'receivedAt'> } | { drop: PluginBleWatchDropReason } {
  const advertisement: PluginBleAdvertisement | null = decodeBleAdvertisement(raw);
  const entry = raw as Record<string, unknown> | null;
  if (!advertisement || typeof entry?.changed !== 'boolean' || !Array.isArray(entry.filters)) {
    return { drop: 'malformed' };
  }
  const ids = entry.filters.slice(0, BLE_WATCH_MAX_FILTERS);
  if (!ids.every((id) => typeof id === 'number' && Number.isInteger(id))) return { drop: 'malformed' };
  const filterIds = [...new Set(ids as number[])].filter((id) => known.has(id));
  if (filterIds.length === 0) return { drop: 'no-watch' };
  return { event: { ...advertisement, filterIds, changed: entry.changed } };
}
