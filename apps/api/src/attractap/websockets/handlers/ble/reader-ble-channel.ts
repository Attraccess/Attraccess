import { PLUGIN_BLE_LIMITS, PluginBleError, type PluginBleAdvertisement } from '@attraccess/plugins-backend-sdk';
import type { BleSessionClock } from '@attraccess/plugins-backend-sdk/internal';
import type { LoggerService } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { PluginBleMetrics } from '../../../../metrics/definitions/plugin-ble.metrics';
import type {
  BleAllowlistEntry,
  BleDriverLink,
  BleTransportDriver,
} from '../../../../plugin-system/ble/ble-transport-driver';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import {
  BLE_MAX_PENDING_REQUESTS,
  BLE_MAX_SERVER_FRAME_BYTES,
  BLE_PROTOCOL_VERSION,
  bleWireError,
  decodeBleAdvertisement,
  encodeBleOperations,
  loggableInt,
  safeBleDetail,
  type BleReaderCapability,
} from './ble-wire';
import { ReaderBleLink } from './reader-ble-link';

export { BLE_MAX_PENDING_REQUESTS } from './ble-wire';
export { BLE_WRITE_WINDOW } from './reader-ble-link';

/**
 * Session closes may go beyond the request cap by this many: a cap full of abandoned requests must never keep the
 * API from telling the reader to let go of the peripheral.
 */
export const BLE_CLOSE_RESERVE = 4;
/** How long a request may wait for the reader beyond its own timeout before the API gives up on it. */
const REQUEST_GRACE_MS = 5_000;
/** Close and cancellation answers the API waits for before it frees the reader on its side anyway. */
const CLOSE_DEADLINE_MS = 5_000;
/**
 * The reader gets this much less than the plugin's connect deadline, so its own answer for a device that never
 * showed up (`DEVICE_NOT_FOUND`) arrives before the session engine gives up with a bare `TIMEOUT`.
 */
export const BLE_CONNECT_REPORT_MARGIN_MS = 1_000;
const readerConnectTimeout = (timeoutMs: number) =>
  timeoutMs > 2 * BLE_CONNECT_REPORT_MARGIN_MS ? timeoutMs - BLE_CONNECT_REPORT_MARGIN_MS : timeoutMs;

export type WirePayload = Record<string, unknown>;

interface PendingRequest {
  requestId: number;
  sessionId: string;
  operation: string;
  /** The caller gave up (cancel, timeout); the entry only waits for the reader's terminal answer. */
  abandoned: boolean;
  onDone?: () => void;
  settle(result: { ok: true; payload: WirePayload } | { ok: false; error: PluginBleError }): void;
}

interface ChannelOwner {
  kind: 'scan' | 'session';
  sessionId: string;
  link: ReaderBleLink | null;
}

export interface ReaderBleChannelDeps {
  clock: BleSessionClock;
  logger: LoggerService;
  metrics?: PluginBleMetrics;
  capability(): BleReaderCapability | null;
  /** True while the reader runs a firmware update: BLE work is refused with READER_BUSY `ota`. */
  otaInProgress(): boolean;
}

const linkLost = (operation: string) =>
  new PluginBleError('DISCONNECTED', 'The reader connection was lost', { operation, detail: 'reader-link-lost' });

/**
 * The plugin BLE state of ONE reader websocket. Sessions, scans and pending requests are bound to this socket
 * instance, never to the reader id: a stale socket's close or late answer can only touch what it owns.
 */
export class ReaderBleChannel {
  private nextRequestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private owner: ChannelOwner | null = null;
  private closed = false;

  constructor(
    readonly socket: AuthenticatedWebSocket,
    readonly readerId: number,
    private readonly deps: ReaderBleChannelDeps,
  ) {}

  get isClosed(): boolean {
    return this.closed;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get busy(): boolean {
    return this.owner !== null;
  }

  // ------------------------------------------------------------ requests

  /**
   * Sends one request. Throws synchronously when it could not be sent; `result` settles exactly once: with the
   * reader's answer, on cancellation, on the deadline, or when the socket closes.
   */
  request(
    type: AttractapEventType,
    sessionId: string,
    payload: WirePayload,
    operation: string,
    options: {
      signal?: AbortSignal;
      timeoutMs?: number;
      /** Overrides the deadline (`timeoutMs` + grace) after which the API stops waiting for the reader. */
      deadlineMs?: number;
      /** The caller gave up (cancel or deadline) before the reader answered. */
      onAbandoned?: () => void;
      /** The entry is gone: the reader answered, the deadline passed or the socket closed. */
      onDone?: () => void;
      /** A session close: it may use the reserve above the request cap. */
      close?: boolean;
    } = {},
  ): { requestId: number; result: Promise<WirePayload> } {
    if (this.closed) throw linkLost(operation);
    if (options.signal?.aborted) throw new PluginBleError('CANCELLED', `${operation} was cancelled`, { operation });
    if (this.pending.size >= this.maxPending() + (options.close ? BLE_CLOSE_RESERVE : 0)) {
      throw new PluginBleError('READER_BUSY', 'Too many BLE requests are waiting for the reader', {
        operation,
        detail: 'queue-full',
      });
    }
    const requestId = ++this.nextRequestId;
    let resolveResult!: (value: WirePayload) => void;
    let rejectResult!: (error: PluginBleError) => void;
    const result = new Promise<WirePayload>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    // A caller that gave up is told at once; the entry stays until the reader answered or the deadline passed.
    const giveUp = (error: PluginBleError, sendCancel: boolean) => {
      if (entry.abandoned) return;
      entry.abandoned = true;
      options.signal?.removeEventListener('abort', onAbort);
      rejectResult(error);
      if (sendCancel) this.trySend(AttractapEventType.BLE_CANCEL, { sessionId, requestId });
      options.onAbandoned?.();
    };
    const onAbort = () => giveUp(new PluginBleError('CANCELLED', `${operation} was cancelled`, { operation }), true);
    const cancelDeadline = this.deps.clock.setTimeout(
      () => {
        giveUp(new PluginBleError('TIMEOUT', `The reader did not answer ${operation} in time`, { operation }), true);
        this.remove(entry);
      },
      options.deadlineMs ?? (options.timeoutMs ?? PLUGIN_BLE_LIMITS.opTimeoutDefaultMs) + REQUEST_GRACE_MS,
    );
    const entry: PendingRequest = {
      requestId,
      sessionId,
      operation,
      abandoned: false,
      onDone: options.onDone,
      settle: (outcome) => {
        cancelDeadline();
        this.remove(entry);
        options.signal?.removeEventListener('abort', onAbort);
        if (entry.abandoned) return;
        entry.abandoned = true;
        if ('error' in outcome) rejectResult(outcome.error);
        else resolveResult(outcome.payload);
      },
    };
    // Registered before sending: an answer can never arrive for an entry that does not exist yet.
    this.pending.set(requestId, entry);
    try {
      this.send(type, { sessionId, requestId, ...payload }, operation);
    } catch (error) {
      cancelDeadline();
      this.pending.delete(requestId);
      throw error;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    return { requestId, result };
  }

  /** The API's cap, or the smaller one the reader announced. */
  private maxPending(): number {
    const announced = this.deps.capability()?.maxPendingRequests ?? BLE_MAX_PENDING_REQUESTS;
    return Math.min(BLE_MAX_PENDING_REQUESTS, announced);
  }

  private remove(entry: PendingRequest): void {
    if (this.pending.get(entry.requestId) !== entry) return;
    this.pending.delete(entry.requestId);
    entry.onDone?.();
  }

  /** Sends a frame; throws when it is too large for the reader or the socket refused it. */
  private send(type: AttractapEventType, payload: WirePayload, operation: string): void {
    const message = new AttractapEvent(type, { v: BLE_PROTOCOL_VERSION, ...payload });
    if (Buffer.byteLength(JSON.stringify(message)) > BLE_MAX_SERVER_FRAME_BYTES) {
      throw new PluginBleError('INTERNAL', `The ${operation} request does not fit into one reader frame`, {
        operation,
        detail: 'frame-too-large',
      });
    }
    if (!this.socket.sendRaw(message)) throw linkLost(operation);
  }

  private trySend(type: AttractapEventType, payload: WirePayload): void {
    try {
      if (!this.closed) this.send(type, payload, 'cancel');
    } catch {
      // The socket is going away; its close fails everything that is still pending.
    }
  }

  /** The reader's terminal answer (BLE_RESULT / BLE_SCAN_RESULT). Stale or unknown answers are dropped. */
  handleResult(payload: WirePayload): void {
    const requestId = payload.requestId;
    const entry = typeof requestId === 'number' ? this.pending.get(requestId) : undefined;
    if (!entry || entry.sessionId !== payload.sessionId) {
      this.deps.logger.debug?.(
        `ble dropped result reader=${this.readerId} request=${loggableInt(requestId)}: unknown or stale`,
      );
      return;
    }
    if (payload.ok === true) entry.settle({ ok: true, payload });
    else entry.settle({ ok: false, error: bleWireError(payload.error, entry.operation) });
  }

  handleNotification(payload: WirePayload): void {
    const link = this.owner?.sessionId === payload.sessionId ? this.owner.link : null;
    if (!link) {
      this.deps.logger.debug?.(`ble dropped notification reader=${this.readerId}: unknown session`);
      return;
    }
    link.handleNotification(payload);
  }

  handleSessionEnded(payload: WirePayload): void {
    const owner = this.owner;
    if (!owner || owner.sessionId !== payload.sessionId) {
      this.deps.logger.debug?.(`ble dropped session end reader=${this.readerId}: unknown session`);
      return;
    }
    const reason = safeBleDetail(payload.reason) ?? 'unknown';
    const detail = safeBleDetail(payload.detail);
    this.deps.logger.log(
      `ble session ended by reader reader=${this.readerId} session=${owner.sessionId} reason=${reason}` +
        (detail ? ` detail=${detail}` : ''),
    );
    if (owner.link) owner.link.lost(reason, detail);
    else this.release(owner.sessionId, 'session-ended');
  }

  /** The socket closed or the reader identity on it changed: everything on it fails at once. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const link = this.owner?.link;
    for (const entry of [...this.pending.values()]) entry.settle({ ok: false, error: linkLost(entry.operation) });
    if (link) link.lost('link-lost', 'reader-link-lost');
    this.owner = null;
  }

  /** Frees the reader on this socket and fails what is still pending for the session. */
  release(sessionId: string, cause: string): void {
    if (this.owner?.sessionId !== sessionId) return;
    this.owner = null;
    for (const entry of [...this.pending.values()]) {
      if (entry.sessionId === sessionId) {
        entry.settle({
          ok: false,
          error: new PluginBleError('DISCONNECTED', 'The BLE session ended', {
            operation: entry.operation,
            detail: cause,
          }),
        });
      }
    }
  }

  private claim(kind: ChannelOwner['kind'], sessionId: string, operation: string): ChannelOwner {
    if (this.closed) throw linkLost(operation);
    if (this.deps.otaInProgress()) {
      throw new PluginBleError('READER_BUSY', 'The reader is updating its firmware', { operation, detail: 'ota' });
    }
    if (this.owner) {
      throw new PluginBleError('READER_BUSY', 'The reader is busy with another BLE session or scan', {
        operation,
        detail: this.owner.kind === 'scan' ? 'scan' : 'session',
      });
    }
    this.owner = { kind, sessionId, link: null };
    return this.owner;
  }

  // ---------------------------------------------------------------- scan

  async scan(request: Parameters<BleTransportDriver['scan']>[0]): Promise<PluginBleAdvertisement[]> {
    const capability = this.requireCapability('scan');
    const sessionId = randomBytes(16).toString('hex');
    this.claim('scan', sessionId, 'scan');
    const durationMs = Math.min(request.durationMs, capability.maxScanMs);
    let call: { result: Promise<WirePayload> };
    try {
      call = this.request(
        AttractapEventType.BLE_SCAN,
        sessionId,
        { durationMs, filter: request.filter, maxResults: capability.maxScanResults },
        'scan',
        {
          signal: request.signal,
          timeoutMs: durationMs,
          // A cancelled scan keeps the reader until the reader confirmed (or the deadline passed).
          onDone: () => this.release(sessionId, 'scan-ended'),
        },
      );
    } catch (error) {
      this.release(sessionId, 'scan-failed');
      throw error;
    }
    const payload = await call.result;
    const raw = Array.isArray(payload.advertisements) ? payload.advertisements : [];
    // One entry per address (the first), deduplicated before the cap so repeats cannot crowd out other devices.
    const advertisements = new Map<string, PluginBleAdvertisement>();
    for (const entry of raw) {
      if (advertisements.size >= capability.maxScanResults) break;
      const advertisement = decodeBleAdvertisement(entry);
      if (advertisement && !advertisements.has(advertisement.address)) {
        advertisements.set(advertisement.address, advertisement);
      }
    }
    return [...advertisements.values()];
  }

  // ------------------------------------------------------------- connect

  async connect(request: Parameters<BleTransportDriver['connect']>[0]): Promise<BleDriverLink> {
    const capability = this.requireCapability('connect');
    if (request.allowlist.length > capability.maxAllowlistEntries) {
      throw new PluginBleError('READER_UNSUPPORTED', 'The profile has more characteristics than the reader allows', {
        operation: 'connect',
        detail: `allowlist-too-large:${request.allowlist.length}`,
      });
    }
    const { sessionId } = request;
    const owner = this.claim('session', sessionId, 'connect');
    let abandoned = false;
    let call: { result: Promise<WirePayload> };
    try {
      call = this.request(
        AttractapEventType.BLE_SESSION_OPEN,
        sessionId,
        {
          address: request.address,
          addressType: request.addressType,
          connectTimeoutMs: readerConnectTimeout(request.timeoutMs),
          leaseMs: request.leaseMs,
          allowlist: request.allowlist.map(wireAllowlistEntry),
        },
        'connect',
        {
          signal: request.signal,
          timeoutMs: request.timeoutMs,
          // Cancel races the connect on the reader: a close right behind the cancel disconnects whatever came of it.
          onAbandoned: () => {
            abandoned = true;
            void this.closeOnReader(sessionId);
          },
        },
      );
    } catch (error) {
      this.release(sessionId, 'connect-failed');
      throw error;
    }
    let payload: WirePayload;
    try {
      payload = await call.result;
    } catch (error) {
      // An abandoned open is released by `closeOnReader`; a failed one at once.
      if (!abandoned) this.release(sessionId, 'connect-failed');
      throw error;
    }
    const link = new ReaderBleLink(this, sessionId, normalizeMtu(payload.mtu, capability), request, this.deps);
    owner.link = link;
    return link;
  }

  /** Asks the reader to end `sessionId` and frees the reader on this side once it answered or the deadline passed. */
  closeOnReader(sessionId: string): Promise<void> {
    let call: { result: Promise<WirePayload> };
    try {
      call = this.request(AttractapEventType.BLE_SESSION_CLOSE, sessionId, {}, 'close', {
        deadlineMs: CLOSE_DEADLINE_MS,
        close: true,
      });
    } catch {
      this.release(sessionId, 'closed');
      return Promise.resolve();
    }
    return call.result.then(
      () => this.release(sessionId, 'closed'),
      () => this.release(sessionId, 'closed'),
    );
  }

  private requireCapability(operation: string): BleReaderCapability {
    const capability = this.deps.capability();
    if (!capability) {
      throw new PluginBleError('READER_UNSUPPORTED', 'The reader firmware cannot do plugin BLE', {
        operation,
        detail: 'no-ble-capability',
      });
    }
    return capability;
  }
}

function wireAllowlistEntry(entry: BleAllowlistEntry) {
  return {
    s: entry.serviceUuid,
    c: entry.characteristicUuid,
    ops: encodeBleOperations(entry.operations),
    r: entry.maxReadBytes,
    w: entry.maxWriteBytes,
    n: entry.maxNotificationBytes,
  };
}

function normalizeMtu(value: unknown, capability: BleReaderCapability): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return PLUGIN_BLE_LIMITS.mtuMin;
  return Math.min(Math.max(value, PLUGIN_BLE_LIMITS.mtuMin), capability.maxMtu);
}
