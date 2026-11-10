import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { READER_UI_TIMING } from '@attraccess/plugins-backend-sdk';
import { ReaderDeletedEvent, ReaderTimeZoneChangedEvent, ReaderUpdatedEvent } from '../events';
import { AttractapService } from '../attractap.service';
import { ReaderUiAlertsService } from '../../plugin-system/reader-ui/reader-ui-alerts.service';
import {
  READER_UI_INVALIDATE_EVENT,
  ReaderUiRegistry,
  type ReaderUiInvalidation,
} from '../../plugin-system/reader-ui/reader-ui.registry';
import { readerHeartbeat, readerServerTime, type ReaderServerTimePayload } from './websocket-reader-payloads';
import { canonicalTimeZone, isValidTimeZone, readerOffsetMinutes } from './reader-time-zone';
import { WebsocketService } from './websocket.service';
import { withTimeout } from './handlers/ui/ui-slot-contributions';

/** `zone` is the plugin's own spelling (sent, stored, shown); `key` its canonical name for comparing. */
type Answer = { kind: 'zone'; zone: string; key: string } | { kind: 'none' } | { kind: 'timeout' };

/** A resolve that fell back is retried on a heartbeat after this delay, doubling up to the maximum. */
export const TIME_ZONE_RETRY_MIN_MS = 5_000;
export const TIME_ZONE_RETRY_MAX_MS = 300_000;

/** Resource ids in host order: ascending, because the reader's resource relation has no order of its own. */
const hostOrder = (resourceIds: number[]): number[] => [...new Set(resourceIds)].sort((a, b) => a - b);

/** Two spellings of one zone (`Europe/Kyiv`, `Europe/Kiev`) are the same zone. */
const sameZone = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : canonicalTimeZone(a) === canonicalTimeZone(b);

/**
 * One time zone per reader. Plugins that write times on readers declare theirs (`getTimeZone`), the host
 * resolves a single zone from them and sends the zone's UTC offset in `serverTime`. Without an answer the API
 * process zone (`TZ`) applies, as before.
 */
@Injectable()
export class ReaderTimeZoneService {
  private readonly logger = new Logger(ReaderTimeZoneService.name);
  /** Last resolved zone per reader; null = no plugin zone. */
  private readonly zones = new Map<number, string | null>();
  /** Offset last sent to the reader, so a change is pushed at once and only once. */
  private readonly sentOffsets = new Map<number, number>();
  /** `readerId|zoneA|zoneB` (canonical, sorted) conflicts already reported; they go when the plugins agree again. */
  private readonly reportedConflicts = new Set<string>();
  /** Newest resolve per reader, so a slow older answer cannot overwrite a newer one. */
  private readonly latestResolve = new Map<number, number>();
  private resolveCounter = 0;
  /** Resource ids per reader in host order, from sign-in and reader updates, so an invalidate needs no lookup. */
  private readonly resourceIds = new Map<number, number[]>();
  /** Refresh in flight per reader; `dirty` asks it to run once more for requests that came in meanwhile. */
  private readonly refreshes = new Map<number, { dirty: boolean; done: Promise<void> }>();
  /** Readers whose last resolve fell back (providers timed out or failed): retried on a heartbeat once `due`. */
  private readonly retries = new Map<number, { due: number; delayMs: number }>();
  /** Bumped by every reader update, so an older snapshot of a reader's resource ids cannot overwrite a newer one. */
  private readonly resourceGenerations = new Map<number, number>();

  constructor(
    private readonly registry: ReaderUiRegistry,
    private readonly alerts: ReaderUiAlertsService,
    private readonly attractapService: AttractapService,
    private readonly websocketService: WebsocketService,
    private readonly events: EventEmitter2,
  ) {}

  /** The resolved zone of a reader, without asking providers. */
  cachedZone(readerId: number | undefined): string | null {
    return readerId === undefined ? null : (this.zones.get(readerId) ?? null);
  }

  /** Offset (minutes east of UTC) a reader shows `at`; the single source for reader payload offsets. */
  readerUtcOffsetMinutes(readerId: number | undefined, at: Date = new Date()): number {
    return readerOffsetMinutes(this.cachedZone(readerId), at);
  }

  /** `serverTime` for a reader from the cached zone; remembers the offset as sent. */
  serverTimeFor(readerId: number | undefined, now: Date = new Date()): ReaderServerTimePayload {
    const payload = readerServerTime(now, this.cachedZone(readerId));
    if (readerId != null) this.sentOffsets.set(readerId, payload.utcOffsetMinutes);
    return payload;
  }

  /** Generation of a reader's resource ids; pass it with ids read at that time to `resolve`. */
  resourceGeneration(readerId: number): number {
    return this.resourceGenerations.get(readerId) ?? 0;
  }

  /**
   * Asks the plugins of the reader's resources. The first valid zone in host order wins: the reader's resources
   * by id, and for each resource the plugins alphabetically by name. Invalid names are ignored; a timeout or error
   * is no opinion, and when nothing answered in time the cached zone stays. `resourceIds` read at `generation`
   * (`resourceGeneration`) are used only while no reader update came in since.
   * Never throws: authentication waits for this, so a failure falls back to the cached zone.
   */
  async resolve(readerId: number, resourceIds?: number[], generation?: number): Promise<string | null> {
    try {
      return await this.resolveZone(readerId, resourceIds, generation);
    } catch (error) {
      this.logger.warn(`Could not resolve the time zone of reader ${readerId}: ${(error as Error).message}`);
      // A reader forgotten meanwhile (its socket closed) gets no retry entry back.
      if (this.latestResolve.has(readerId)) this.scheduleRetry(readerId);
      return this.cachedZone(readerId);
    }
  }

  /**
   * A resolve that fell back (providers timed out, e.g. right after an API restart) is retried on a heartbeat of
   * the reader once its backoff is due (5 s, doubling to 5 min), never while a refresh of the reader runs.
   */
  onHeartbeat(readerId: number | null | undefined): void {
    if (readerId == null || this.refreshes.has(readerId)) return;
    const retry = this.retries.get(readerId);
    if (!retry || Date.now() < retry.due) return;
    void this.refresh(readerId);
  }

  /** Forgets a reader unless another socket still is it or is signing in as it. */
  forgetUnlessInUse(readerId: number, leavingSocketId?: string): void {
    if (!this.inUse(readerId, leavingSocketId)) this.forget(readerId);
  }

  private async resolveZone(readerId: number, resourceIds?: number[], generation?: number): Promise<string | null> {
    const ticket = ++this.resolveCounter;
    this.latestResolve.set(readerId, ticket);
    // An older snapshot (read before a reader update) is ignored: the ids of the update are newer.
    if (resourceIds && (generation === undefined || generation === this.resourceGeneration(readerId))) {
      this.resourceIds.set(readerId, hostOrder(resourceIds));
    }
    const providers = this.zoneProviders();
    if (providers.length === 0) {
      this.clearConflicts(readerId);
      this.retries.delete(readerId);
      return this.store(readerId, null);
    }
    // While a retry streak runs, its timeouts were already reported once.
    const report = (plugin: string, outcome: string) => {
      if (this.retries.has(readerId)) this.logger.debug(`Plugin ${plugin} getTimeZone ${outcome}`);
      else this.logger.warn(`Plugin ${plugin} getTimeZone ${outcome}`);
    };
    const ids = await this.resourceIdsOf(readerId);
    const calls = ids.flatMap((resourceId) =>
      providers.map(({ plugin, provider }) => ({ resourceId, plugin, provider })),
    );
    const answers = await Promise.all(
      calls.map(async ({ resourceId, plugin, provider }): Promise<{ plugin: string; answer: Answer }> => {
        try {
          const work = Promise.resolve().then(() => provider.getTimeZone?.({ readerId, resourceId }));
          const zone = await withTimeout(work, READER_UI_TIMING.hookDefaultTimeoutMs);
          if (zone === undefined || zone === null) return { plugin, answer: { kind: 'none' } };
          if (!isValidTimeZone(zone)) {
            this.logger.warn(`Plugin ${plugin} returned an invalid reader time zone and it is ignored`);
            return { plugin, answer: { kind: 'none' } };
          }
          return { plugin, answer: { kind: 'zone', zone, key: canonicalTimeZone(zone) } };
        } catch (error) {
          const timedOut = (error as Error)?.message === 'timeout';
          report(plugin, timedOut ? 'timed out' : 'failed');
          return { plugin, answer: { kind: timedOut ? 'timeout' : 'none' } };
        }
      }),
    );
    // A newer resolve started while this one waited: its answer decides, this one is dropped.
    if (this.latestResolve.get(readerId) !== ticket) return this.cachedZone(readerId);
    const zones = answers.flatMap(({ plugin, answer }) =>
      answer.kind === 'zone' ? [{ plugin, zone: answer.zone, key: answer.key }] : [],
    );
    const timedOut = answers.some(({ answer }) => answer.kind === 'timeout');
    if (zones.length === 0) {
      if (timedOut) return this.keepCached(readerId);
      this.clearConflicts(readerId);
      this.retries.delete(readerId);
      return this.store(readerId, null);
    }
    // A higher-ranked provider that timed out may hold the real zone: keep what is cached instead of
    // flipping to a lower-ranked answer (without a cached zone the answer serves for now), and ask again later.
    const firstZone = answers.findIndex(({ answer }) => answer.kind === 'zone');
    const higherTimedOut = answers.slice(0, firstZone).some(({ answer }) => answer.kind === 'timeout');
    const cached = this.cachedZone(readerId);
    if (cached !== null && higherTimedOut) return this.keepCached(readerId);
    if (higherTimedOut) this.scheduleRetry(readerId);
    else this.retries.delete(readerId);
    const winner = zones[0];
    const other = zones.find(({ key }) => key !== winner.key);
    if (other) this.reportConflict(readerId, winner, other);
    else if (!timedOut) this.clearConflicts(readerId);
    return this.store(readerId, winner.zone);
  }

  /** A plugin changed its reader content or time zone: the affected readers get the new offset at once. */
  @OnEvent(READER_UI_INVALIDATE_EVENT)
  async onInvalidate(event: ReaderUiInvalidation): Promise<void> {
    // Only a plugin that declares reader zones can change one; content-only invalidations cost nothing here.
    if (!this.zoneProviders().some(({ plugin }) => plugin === event.pluginName)) return;
    const { readerId, resourceId } = event.scope ?? {};
    const readerIds = new Set<number>();
    for (const socket of this.websocketService.sockets.values()) {
      // A reader still signing in is refreshed too, so a change during its sign-in is not lost.
      const id = socket.readerId ?? socket.state?.signingIn?.readerId;
      if (id == null || (readerId !== undefined && readerId !== id)) continue;
      readerIds.add(id);
    }
    await Promise.all(
      [...readerIds].map(async (id) => {
        if (resourceId !== undefined && !(await this.resourceIdsOf(id)).includes(resourceId)) return;
        await this.refresh(id);
      }),
    );
  }

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  async onReaderUpdated(event: ReaderUpdatedEvent): Promise<void> {
    const readerId = event.reader.id;
    this.resourceGenerations.set(readerId, this.resourceGeneration(readerId) + 1);
    const resourceIds = event.reader.resources?.map((resource) => resource.id);
    // Without the relation the ids are looked up again.
    if (!resourceIds) this.resourceIds.delete(readerId);
    // A reader without a connection resolves its zone when it signs in.
    if (!this.inUse(readerId)) {
      this.resourceIds.delete(readerId);
      return;
    }
    await this.refresh(readerId, resourceIds);
  }

  /** A deleted reader leaves nothing behind. */
  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  onReaderDeleted(event: ReaderDeletedEvent): void {
    this.forget(event.readerId);
    this.resourceGenerations.delete(event.readerId);
  }

  /** Drops what is remembered about a reader that went away; a resolve still in flight is dropped too. */
  forget(readerId: number): void {
    this.zones.delete(readerId);
    this.sentOffsets.delete(readerId);
    this.latestResolve.delete(readerId);
    this.resourceIds.delete(readerId);
    this.retries.delete(readerId);
    this.clearConflicts(readerId);
  }

  /** True while a socket (other than one that is leaving) is the reader or is signing in as it. */
  private inUse(readerId: number, leavingSocketId?: string): boolean {
    return [...this.websocketService.sockets.values()].some(
      (socket) =>
        (leavingSocketId === undefined || socket.id !== leavingSocketId) &&
        (socket.readerId === readerId || socket.state?.signingIn?.readerId === readerId),
    );
  }

  private zoneProviders() {
    return this.registry.providers().filter(({ provider }) => typeof provider.getTimeZone === 'function');
  }

  private async resourceIdsOf(readerId: number): Promise<number[]> {
    const known = this.resourceIds.get(readerId);
    if (known) return known;
    const generation = this.resourceGeneration(readerId);
    const loaded = hostOrder((await this.attractapService.findReaderById(readerId))?.resources?.map((r) => r.id) ?? []);
    // A sign-in or reader update during the read already stored newer ids, or made this read stale.
    if (!this.resourceIds.has(readerId) && generation === this.resourceGeneration(readerId)) {
      this.resourceIds.set(readerId, loaded);
    }
    return this.resourceIds.get(readerId) ?? loaded;
  }

  /**
   * Resolves again and pushes the offset when it differs from what the reader has. Requests for a reader whose
   * refresh is running are coalesced into one more run after it.
   */
  private refresh(readerId: number, resourceIds?: number[]): Promise<void> {
    if (resourceIds) this.resourceIds.set(readerId, hostOrder(resourceIds));
    const running = this.refreshes.get(readerId);
    if (running) {
      running.dirty = true;
      return running.done;
    }
    const run = { dirty: false, done: Promise.resolve() };
    this.refreshes.set(readerId, run);
    run.done = (async () => {
      try {
        do {
          run.dirty = false;
          await this.refreshOnce(readerId);
        } while (run.dirty);
      } finally {
        this.refreshes.delete(readerId);
      }
    })();
    return run.done;
  }

  private async refreshOnce(readerId: number): Promise<void> {
    try {
      const before = this.cachedZone(readerId);
      const zone = await this.resolve(readerId);
      const offset = this.readerUtcOffsetMinutes(readerId);
      const offsetChanged = this.sentOffsets.get(readerId) !== offset;
      if (sameZone(zone, before) && !offsetChanged) return;
      const sockets = [...this.websocketService.sockets.values()].filter(
        (socket) => socket.readerId === readerId && socket.readyState === 1,
      );
      if (sockets.length === 0) return;
      if (offsetChanged) {
        const heartbeat = readerHeartbeat(this.serverTimeFor(readerId));
        for (const socket of sockets) (socket as unknown as { send: (data: string) => void }).send(heartbeat);
      }
      // Session start times in the resource list carry the zone's offsets as well.
      this.events.emit(ReaderTimeZoneChangedEvent.EVENT_NAME, new ReaderTimeZoneChangedEvent(readerId));
    } catch (error) {
      this.logger.warn(`Could not refresh the time zone of reader ${readerId}: ${(error as Error).message}`);
    }
  }

  /** Nothing usable answered in time: the cached zone stays, and a later heartbeat asks again. */
  private keepCached(readerId: number): string | null {
    this.scheduleRetry(readerId);
    return this.cachedZone(readerId);
  }

  /** Backoff per reader: a provider that keeps timing out is asked less and less often, at most every 5 min. */
  private scheduleRetry(readerId: number): void {
    const previous = this.retries.get(readerId);
    const delayMs = previous ? Math.min(TIME_ZONE_RETRY_MAX_MS, previous.delayMs * 2) : TIME_ZONE_RETRY_MIN_MS;
    this.retries.set(readerId, { due: Date.now() + delayMs, delayMs });
  }

  private store(readerId: number, zone: string | null): string | null {
    this.zones.set(readerId, zone);
    return zone;
  }

  private clearConflicts(readerId: number): void {
    const prefix = `${readerId}|`;
    for (const key of this.reportedConflicts) if (key.startsWith(prefix)) this.reportedConflicts.delete(key);
  }

  private reportConflict(
    readerId: number,
    kept: { plugin: string; zone: string; key: string },
    ignored: { plugin: string; zone: string; key: string },
  ): void {
    const key = [readerId, ...[kept.key, ignored.key].sort()].join('|');
    if (this.reportedConflicts.has(key)) return;
    this.reportedConflicts.add(key);
    void this.alerts
      .raise(
        'time-zone-conflict',
        `Conflicting reader time zones: ${kept.plugin} uses ${kept.zone}, ${ignored.plugin} uses ${ignored.zone}. The reader shows ${kept.zone}.`,
        { plugin: ignored.plugin, readerId },
      )
      .catch((error) => this.logger.error(`Could not raise time-zone-conflict alert: ${(error as Error).message}`));
  }
}
