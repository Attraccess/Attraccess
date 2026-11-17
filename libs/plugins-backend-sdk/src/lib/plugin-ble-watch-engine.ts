import {
  PLUGIN_BLE_WATCH_LIMITS,
  PluginBleError,
  type PluginBleAdvertisement,
  type PluginBleProfile,
  type PluginBleWatch,
  type PluginBleWatchEvent,
  type PluginBleWatchHandler,
  type PluginBleWatchOptions,
  type PluginBleWatchReaderState,
} from './plugin-ble';
import { validateBleReaderId } from './plugin-ble-validation';

/**
 * The plugin side of one advertisement watch, shared by the API host and the SDK fake: argument validation, the
 * serial handler with its bounded queue, the per-reader status and the close lifecycle. Which readers report what
 * is up to the owner, which calls `setReaderStatus` and `push`.
 */

export type BleWatchCloseReason = 'closed' | 'cancelled' | 'shutdown';

/** Readers one watch may list in `readerIds`. */
export const BLE_WATCH_MAX_READER_IDS = 256;

export interface ResolvedBleWatchOptions {
  /** `null`: every reader open for plugins, including ones opened later. */
  readerIds: number[] | null;
  signal?: AbortSignal;
  onReaderStatus?: PluginBleWatchOptions['onReaderStatus'];
}

/** Validates the handler and the options; rejects with `INVALID_ARGUMENT`, or `CANCELLED` for an aborted signal. */
export function resolveBleWatchOptions(handler: unknown, options: unknown = {}): ResolvedBleWatchOptions {
  const invalid = (field: string, problem: string) =>
    new PluginBleError('INVALID_ARGUMENT', `${field}: ${problem}`, { operation: 'watch', detail: field });
  if (typeof handler !== 'function') throw invalid('handler', 'must be a function');
  if (typeof options !== 'object' || options === null) throw invalid('options', 'must be an object');
  const raw = options as PluginBleWatchOptions;
  if (raw.onReaderStatus !== undefined && typeof raw.onReaderStatus !== 'function') {
    throw invalid('onReaderStatus', 'must be a function');
  }
  let readerIds: number[] | null = null;
  if (raw.readerIds !== undefined) {
    if (!Array.isArray(raw.readerIds) || raw.readerIds.length > BLE_WATCH_MAX_READER_IDS) {
      throw invalid('readerIds', `must be an array of at most ${BLE_WATCH_MAX_READER_IDS} reader ids`);
    }
    readerIds = [...new Set(raw.readerIds.map((id, index) => validateBleReaderId(id, `readerIds[${index}]`)))];
  }
  if (raw.signal?.aborted) throw new PluginBleError('CANCELLED', 'watch was cancelled', { operation: 'watch' });
  return { readerIds, signal: raw.signal, onReaderStatus: raw.onReaderStatus };
}

/** The profile's advertisement filter; a profile without one cannot watch (`INVALID_PROFILE`). */
export function requireBleWatchFilter(profile: PluginBleProfile): NonNullable<PluginBleProfile['advertisement']> {
  if (!profile.advertisement) {
    throw new PluginBleError('INVALID_PROFILE', `Profile "${profile.id}" has no advertisement filter`, {
      operation: 'watch',
      detail: 'advertisement',
    });
  }
  return profile.advertisement;
}

/**
 * A lenient reader-side match of a watch filter: any listed service UUID, manufacturer id or the name prefix. Core
 * applies the profile match (every criterion the filter sets, as the reader firmware does) before delivering.
 */
export function matchesBleWatchFilter(
  filter: { serviceUuids: readonly string[]; manufacturerIds: readonly number[]; namePrefix?: string },
  advertisement: PluginBleAdvertisement,
): boolean {
  if (advertisement.serviceUuids.some((uuid) => filter.serviceUuids.includes(uuid))) return true;
  if (advertisement.manufacturerData.some((entry) => filter.manufacturerIds.includes(entry.companyId))) return true;
  return filter.namePrefix !== undefined && (advertisement.name ?? '').startsWith(filter.namePrefix);
}

/** What makes an advertising payload "changed": manufacturer data, name and service UUIDs, never the RSSI. */
export function bleWatchPayloadKey(advertisement: PluginBleAdvertisement): string {
  return JSON.stringify([
    advertisement.name ?? null,
    [...advertisement.serviceUuids].sort(),
    advertisement.manufacturerData.map((entry) => [entry.companyId, Buffer.from(entry.data).toString('base64')]),
  ]);
}

export interface BleWatchEngineDeps {
  id: string;
  profileId: string;
  handler: PluginBleWatchHandler;
  options: ResolvedBleWatchOptions;
  /** Events queued while the handler runs; default `PLUGIN_BLE_WATCH_LIMITS.maxQueuedEvents`. */
  maxQueuedEvents?: number;
  /** The handler or the status callback threw. The watch goes on. */
  onCallbackError?(kind: 'handler' | 'status', error: unknown): void;
  /** The oldest queued event was dropped for a new one. */
  onDropped?(): void;
  /** Called once, synchronously, when the watch ends. */
  onClosed(reason: BleWatchCloseReason): void;
}

function copyEvent(event: PluginBleWatchEvent): PluginBleWatchEvent {
  return {
    ...event,
    serviceUuids: [...event.serviceUuids],
    manufacturerData: event.manufacturerData.map((entry) => ({
      companyId: entry.companyId,
      data: Uint8Array.from(entry.data),
    })),
    receivedAt: new Date(event.receivedAt),
  };
}

export class BleWatchEngine {
  readonly handle: PluginBleWatch;
  private readonly states = new Map<number, PluginBleWatchReaderState>();
  private queue: PluginBleWatchEvent[] = [];
  private draining = false;
  private statusTail: Promise<void> = Promise.resolve();
  private reason: BleWatchCloseReason | null = null;
  private resolveClosed!: (value: { reason: BleWatchCloseReason }) => void;
  private readonly onAbort = () => void this.close('cancelled');

  constructor(private readonly deps: BleWatchEngineDeps) {
    const closed = new Promise<{ reason: BleWatchCloseReason }>((resolve) => (this.resolveClosed = resolve));
    this.handle = Object.freeze({
      id: deps.id,
      profileId: deps.profileId,
      readers: () => [...this.states.values()].sort((a, b) => a.readerId - b.readerId).map((state) => ({ ...state })),
      close: () => this.close('closed'),
      closed,
    });
    deps.options.signal?.addEventListener('abort', this.onAbort, { once: true });
  }

  get id(): string {
    return this.deps.id;
  }

  get isClosed(): boolean {
    return this.reason !== null;
  }

  /** Records a reader's status; the status callback runs (serially) only when it changed. */
  setReaderStatus(state: PluginBleWatchReaderState): void {
    if (this.reason) return;
    const previous = this.states.get(state.readerId);
    if (previous && previous.status === state.status && previous.detail === state.detail) return;
    const next: PluginBleWatchReaderState = { readerId: state.readerId, status: state.status };
    if (state.detail !== undefined) next.detail = state.detail;
    this.states.set(state.readerId, next);
    const callback = this.deps.options.onReaderStatus;
    if (!callback) return;
    this.statusTail = this.statusTail
      .then(() => (this.reason ? undefined : callback({ ...next })))
      .catch((error) => this.deps.onCallbackError?.('status', error));
  }

  readerStatus(readerId: number): PluginBleWatchReaderState | undefined {
    return this.states.get(readerId);
  }

  /** Queues one event for the handler; beyond the queue bound the oldest queued event is dropped. */
  push(event: PluginBleWatchEvent): void {
    if (this.reason) return;
    if (this.queue.length >= (this.deps.maxQueuedEvents ?? PLUGIN_BLE_WATCH_LIMITS.maxQueuedEvents)) {
      this.queue.shift();
      this.deps.onDropped?.();
    }
    this.queue.push(copyEvent(event));
    if (!this.draining) {
      this.draining = true;
      // Never inside the caller's stack: the transport delivering an event must not run plugin code.
      void Promise.resolve().then(() => this.drain());
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && !this.reason) {
      const event = this.queue.shift() as PluginBleWatchEvent;
      try {
        await this.deps.handler(event);
      } catch (error) {
        this.deps.onCallbackError?.('handler', error);
      }
    }
    this.draining = false;
  }

  /** Idempotent. Queued events are discarded; a handler call in progress finishes on its own. */
  close(reason: BleWatchCloseReason): Promise<void> {
    if (this.reason) return Promise.resolve();
    this.reason = reason;
    this.queue = [];
    this.deps.options.signal?.removeEventListener('abort', this.onAbort);
    this.deps.onClosed(reason);
    this.resolveClosed({ reason });
    return Promise.resolve();
  }
}
