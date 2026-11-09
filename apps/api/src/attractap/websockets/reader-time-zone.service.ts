import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { READER_UI_TIMING } from '@attraccess/plugins-backend-sdk';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { AttractapService } from '../attractap.service';
import { ReaderUiAlertsService } from '../../plugin-system/reader-ui/reader-ui-alerts.service';
import {
  READER_UI_INVALIDATE_EVENT,
  ReaderUiRegistry,
  type ReaderUiInvalidation,
} from '../../plugin-system/reader-ui/reader-ui.registry';
import { readerHeartbeat, readerServerTime, type ReaderServerTimePayload } from './websocket-reader-payloads';
import { isValidTimeZone, readerOffsetMinutes } from './reader-time-zone';
import { WebsocketService } from './websocket.service';
import { withTimeout } from './handlers/ui/ui-slot-contributions';

type Answer = { kind: 'zone'; zone: string } | { kind: 'none' } | { kind: 'timeout' };

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
  /** `readerId|zoneA|zoneB` conflicts already reported; a reader's keys go when its plugins agree again. */
  private readonly reportedConflicts = new Set<string>();
  /** Newest resolve per reader, so a slow older answer cannot overwrite a newer one. */
  private readonly latestResolve = new Map<number, number>();
  private resolveCounter = 0;

  constructor(
    private readonly registry: ReaderUiRegistry,
    private readonly alerts: ReaderUiAlertsService,
    private readonly attractapService: AttractapService,
    private readonly websocketService: WebsocketService,
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
    if (readerId !== undefined) this.sentOffsets.set(readerId, payload.utcOffsetMinutes);
    return payload;
  }

  /** Re-resolves the zone, then builds `serverTime`. Used when a reader authenticates. */
  async resolvedServerTimeFor(readerId: number, now: Date = new Date()): Promise<ReaderServerTimePayload> {
    await this.resolve(readerId);
    return this.serverTimeFor(readerId, now);
  }

  /**
   * Asks the plugins of the reader's resources. The first valid zone in host order wins; invalid names are
   * ignored; a timeout or error is no opinion, and when nothing answered in time the cached zone stays.
   * Never throws: authentication waits for this, so a failure falls back to the cached zone.
   */
  async resolve(readerId: number, resourceIds?: number[]): Promise<string | null> {
    try {
      return await this.resolveZone(readerId, resourceIds);
    } catch (error) {
      this.logger.warn(`Could not resolve the time zone of reader ${readerId}: ${(error as Error).message}`);
      return this.cachedZone(readerId);
    }
  }

  private async resolveZone(readerId: number, resourceIds?: number[]): Promise<string | null> {
    const ticket = ++this.resolveCounter;
    this.latestResolve.set(readerId, ticket);
    const providers = this.registry.providers().filter(({ provider }) => typeof provider.getTimeZone === 'function');
    if (providers.length === 0) {
      this.clearConflicts(readerId);
      return this.store(readerId, null);
    }
    const ids =
      resourceIds ?? (await this.attractapService.findReaderById(readerId))?.resources?.map((r) => r.id) ?? [];
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
          return { plugin, answer: { kind: 'zone', zone } };
        } catch (error) {
          const timedOut = (error as Error)?.message === 'timeout';
          this.logger.warn(`Plugin ${plugin} getTimeZone ${timedOut ? 'timed out' : 'failed'}`);
          return { plugin, answer: { kind: timedOut ? 'timeout' : 'none' } };
        }
      }),
    );
    // A newer resolve started while this one waited: its answer decides, this one is dropped.
    if (this.latestResolve.get(readerId) !== ticket) return this.cachedZone(readerId);
    const zones = answers.flatMap(({ plugin, answer }) =>
      answer.kind === 'zone' ? [{ plugin, zone: answer.zone }] : [],
    );
    const timedOut = answers.some(({ answer }) => answer.kind === 'timeout');
    if (zones.length === 0) {
      if (timedOut) return this.cachedZone(readerId);
      this.clearConflicts(readerId);
      return this.store(readerId, null);
    }
    // A higher-ranked provider that timed out may hold the real zone: keep what is cached instead of
    // flipping to a lower-ranked answer.
    const firstZone = answers.findIndex(({ answer }) => answer.kind === 'zone');
    const cached = this.cachedZone(readerId);
    if (cached !== null && answers.slice(0, firstZone).some(({ answer }) => answer.kind === 'timeout')) return cached;
    const winner = zones[0];
    const other = zones.find(({ zone }) => zone !== winner.zone);
    if (other) this.reportConflict(readerId, winner, other);
    else if (!timedOut) this.clearConflicts(readerId);
    return this.store(readerId, winner.zone);
  }

  /** A plugin changed its reader content or time zone: the affected readers get the new offset at once. */
  @OnEvent(READER_UI_INVALIDATE_EVENT)
  async onInvalidate(event: ReaderUiInvalidation): Promise<void> {
    const { readerId, resourceId } = event.scope ?? {};
    for (const socket of this.websocketService.sockets.values()) {
      if (socket.readerId == null || (readerId !== undefined && readerId !== socket.readerId)) continue;
      if (resourceId !== undefined && !(await this.readerHasResource(socket.readerId, resourceId))) continue;
      await this.refresh(socket.readerId);
    }
  }

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  async onReaderUpdated(event: ReaderUpdatedEvent): Promise<void> {
    await this.refresh(
      event.reader.id,
      event.reader.resources?.map((resource) => resource.id),
    );
  }

  /** A deleted reader leaves nothing behind. */
  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  onReaderDeleted(event: ReaderDeletedEvent): void {
    this.forget(event.readerId);
  }

  /** Drops what is remembered about a reader that went away; a resolve still in flight is dropped too. */
  forget(readerId: number): void {
    this.zones.delete(readerId);
    this.sentOffsets.delete(readerId);
    this.latestResolve.delete(readerId);
    this.clearConflicts(readerId);
  }

  private async readerHasResource(readerId: number, resourceId: number): Promise<boolean> {
    const reader = await this.attractapService.findReaderById(readerId);
    return reader?.resources?.some((resource) => resource.id === resourceId) ?? false;
  }

  /** Resolves again and pushes the offset when it differs from what the reader has. */
  private async refresh(readerId: number, resourceIds?: number[]): Promise<void> {
    try {
      await this.resolve(readerId, resourceIds);
      const offset = this.readerUtcOffsetMinutes(readerId);
      if (this.sentOffsets.get(readerId) === offset) return;
      for (const socket of this.websocketService.sockets.values()) {
        if (socket.readerId !== readerId || socket.readyState !== 1) continue;
        this.sentOffsets.set(readerId, offset);
        (socket as unknown as { send: (data: string) => void }).send(readerHeartbeat(this.serverTimeFor(readerId)));
      }
    } catch (error) {
      this.logger.warn(`Could not refresh the time zone of reader ${readerId}: ${(error as Error).message}`);
    }
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
    kept: { plugin: string; zone: string },
    ignored: { plugin: string; zone: string },
  ): void {
    const key = `${readerId}|${kept.zone}|${ignored.zone}`;
    if (this.reportedConflicts.has(key)) return;
    this.reportedConflicts.add(key);
    void this.alerts
      .raise(
        'time-zone-conflict',
        `Plugins disagree on the reader time zone: ${kept.plugin} uses ${kept.zone}, ${ignored.plugin} uses ${ignored.zone}. The reader shows ${kept.zone}.`,
        { plugin: ignored.plugin, readerId },
      )
      .catch((error) => this.logger.error(`Could not raise time-zone-conflict alert: ${(error as Error).message}`));
  }
}
