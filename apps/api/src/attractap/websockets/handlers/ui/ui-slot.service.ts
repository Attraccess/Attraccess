import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { READER_UI_SLOTS, READER_UI_TIMING, type ReaderUiCapabilities } from '@attraccess/plugins-backend-sdk';
import { AttractapService } from '../../../attractap.service';
import { ReaderUpdatedEvent } from '../../../events';
import { validateReaderUiCapabilities } from '../../../../resources/forms/reader-ui.validation';
import { ReaderUiAlertsService } from '../../../../plugin-system/reader-ui/reader-ui-alerts.service';
import { ReaderUiSettingsService } from '../../../../plugin-system/reader-ui/reader-ui-settings.service';
import {
  READER_UI_INVALIDATE_EVENT,
  ReaderUiRegistry,
  type ReaderUiInvalidation,
} from '../../../../plugin-system/reader-ui/reader-ui.registry';
import { SettingsService } from '../../../../settings/settings.service';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import { WebsocketService } from '../../websocket.service';
import { CardSessionService } from './card-session.service';
import { UiSlotRateLimiter } from './ui-rate-limiter';
import { collectContributions, pendingKey, skipProvider, type Collected, type Desired } from './ui-slot-contributions';
import { contributionKey, type UiContributionRecord, type UiSlotsState } from './ui-socket-state';

/** Plugin invalidations within this window become one sync per reader. */
export const UI_INVALIDATE_DEBOUNCE_MS = 100;
/** Hash of a record the reader cleared on its own: the next sync sends it again. */
const FORGOTTEN = 'forgotten';
const REPORT_STATUSES = ['skipped', 'dropped'];

/** Per pass of `syncOnce`. */
interface Pass {
  socket: AuthenticatedWebSocket;
  state: UiSlotsState;
  now: number;
  /** Sign-in/out: user-scoped content is replaced or removed without waiting for the rate limit. */
  privacy: boolean;
  blockedFor: number;
  /** Card session when the pass started; user-scoped records sent by this pass belong to it. */
  cardSessionId: string | undefined;
}

/** Pushes plugin slot contributions to a reader and keeps its view of them in step (UI_SLOT_UPDATE). */
@Injectable()
export class UiSlotService {
  private readonly logger = new Logger(UiSlotService.name);
  /** Public slots use the reader language (D18); null until read or changed. */
  private defaultLanguage: 'en' | 'de' | null = null;

  constructor(
    private readonly registry: ReaderUiRegistry,
    private readonly settings: ReaderUiSettingsService,
    private readonly alerts: ReaderUiAlertsService,
    private readonly attractapService: AttractapService,
    private readonly websocketService: WebsocketService,
    private readonly cardSessions: CardSessionService,
    private readonly settingsService: SettingsService,
  ) {
    cardSessions.onStarted((socket) => this.privacySync(socket));
    cardSessions.onEnded((socket) => {
      this.forgetSessionSlot(socket);
      this.privacySync(socket);
    });
    alerts.onCleared((alert) => {
      if (alert.kind === 'crash-loop') this.syncReader(alert.readerId ?? undefined);
    });
  }

  /** After READER_FIRMWARE_INFO: remember the reader's capabilities, reset revisions and do the full sync. */
  async onFirmwareInfo(socket: AuthenticatedWebSocket, rawUi: unknown): Promise<void> {
    this.cleanup(socket);
    socket.state.uiSlots = this.freshState(validateReaderUiCapabilities(rawUi));
    await this.sync(socket);
  }

  cleanup(socket: AuthenticatedWebSocket): void {
    const state = socket.state?.uiSlots;
    if (!state) return;
    state.timers.forEach((timer) => clearTimeout(timer));
    state.timers.clear();
    if (state.flushTimer) clearTimeout(state.flushTimer);
    if (state.invalidateTimer) clearTimeout(state.invalidateTimer);
    state.flushTimer = null;
    state.invalidateTimer = null;
    state.inflight.clear();
  }

  /**
   * UI_RENDER_REPORT: the reader dropped a contribution. Firmware sends
   * `{resourceId, slot, owner, key, revision, status: 'skipped', reason}`; older drafts used `status: 'dropped'`.
   */
  renderReport(socket: AuthenticatedWebSocket, payload: Record<string, unknown>): void {
    const state = socket.state?.uiSlots;
    if (!state || typeof payload?.owner !== 'string' || !REPORT_STATUSES.includes(String(payload.status))) return;
    const record = state.contributions.get(
      contributionKey(Number(payload.resourceId), String(payload.slot), payload.owner, String(payload.key)),
    );
    if (!record || payload.revision !== record.revision) return;
    const reason = String(payload.reason ?? 'dropped')
      .replace(/[^a-z0-9_-]/gi, '')
      .slice(0, 32);
    record.status = 'skipped';
    record.reason = `reader-${reason || 'dropped'}`;
  }

  contributionsOf(readerId: number) {
    const socket = [...this.websocketService.sockets.values()].find((s) => s.readerId === readerId);
    return [...(socket?.state.uiSlots?.contributions.values() ?? [])].map(
      ({ plugin, resourceId, slot, key, status, reason }) => ({ plugin, resourceId, slot, key, status, reason }),
    );
  }

  /** `scope.readerId` / `scope.resourceId` narrow the readers; bursts become one sync per reader. */
  @OnEvent(READER_UI_INVALIDATE_EVENT)
  onInvalidate(event: ReaderUiInvalidation): void {
    const { readerId, resourceId } = event.scope ?? {};
    for (const socket of this.websocketService.sockets.values()) {
      const state = socket.state?.uiSlots;
      if (socket.readerId == null || !state?.capabilities) continue;
      if (readerId !== undefined && readerId !== socket.readerId) continue;
      if (resourceId !== undefined && state.resourceIds && !state.resourceIds.includes(resourceId)) continue;
      if (state.invalidateTimer) continue;
      state.invalidateTimer = setTimeout(() => {
        state.invalidateTimer = null;
        void this.sync(socket);
      }, UI_INVALIDATE_DEBOUNCE_MS);
      state.invalidateTimer.unref?.();
    }
  }

  /** Attaching or detaching resources changes which rows the reader shows, so its slot content must follow. */
  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  onReaderUpdated(event: ReaderUpdatedEvent): void {
    const resourceIds = event.reader.resources?.map((resource) => resource.id) ?? null;
    for (const socket of this.websocketService.sockets.values()) {
      const state = socket.state?.uiSlots;
      if (state && socket.readerId === event.reader.id) state.resourceIds = resourceIds;
    }
    this.syncReader(event.reader.id);
  }

  /** Public slots follow the default language. */
  @OnEvent('settings.default-language')
  onDefaultLanguage(language: 'en' | 'de'): void {
    this.defaultLanguage = language;
    this.syncReader(undefined);
  }

  syncReader(readerId: number | undefined): void {
    for (const socket of this.websocketService.sockets.values()) {
      if (readerId === undefined || socket.readerId === readerId) void this.sync(socket);
    }
  }

  async sync(socket: AuthenticatedWebSocket): Promise<void> {
    const state = socket.state?.uiSlots;
    if (!state || socket.readerId == null) return;
    if (state.syncing) {
      state.resync = true;
      return;
    }
    state.syncing = true;
    try {
      do {
        state.resync = false;
        await this.syncOnce(socket, state);
      } while (state.resync);
    } catch (error) {
      this.logger.warn(`Slot sync failed for reader ${socket.readerId}: ${(error as Error).message}`);
    } finally {
      state.syncing = false;
    }
  }

  private privacySync(socket: AuthenticatedWebSocket): void {
    const state = socket.state?.uiSlots;
    if (!state) return;
    state.privacyFlush = true;
    void this.sync(socket);
  }

  /** The reader clears its session slot on sign-out; whatever it should show there afterwards is sent again. */
  private forgetSessionSlot(socket: AuthenticatedWebSocket): void {
    for (const record of socket.state?.uiSlots?.contributions.values() ?? []) {
      if (record.slot === READER_UI_SLOTS.RESOURCE_DETAILS_SESSION) record.hash = FORGOTTEN;
    }
  }

  private freshState(capabilities: ReaderUiCapabilities | null): UiSlotsState {
    return {
      capabilities,
      inflight: new Map(),
      revisions: new Map(),
      contributions: new Map(),
      resourceIds: null,
      pendingProviders: new Set(),
      limiter: new UiSlotRateLimiter(READER_UI_TIMING.slotUpdateMinIntervalMs),
      timers: new Map(),
      flushTimer: null,
      invalidateTimer: null,
      syncing: false,
      resync: false,
      privacyFlush: false,
    };
  }

  private async syncOnce(socket: AuthenticatedWebSocket, state: UiSlotsState): Promise<void> {
    const cardSessionId = this.cardSessions.current(socket)?.id;
    const pass: Pass = { socket, state, now: Date.now(), privacy: state.privacyFlush, blockedFor: 0, cardSessionId };
    state.privacyFlush = false;
    // Another user's content must not stay on screen while the providers run (up to their timeout).
    if (pass.privacy) this.retireForeignUserContent(pass);
    const { desired, keep } = await this.desired(socket, state);
    if (this.cardSessions.current(socket)?.id !== cardSessionId) {
      // Signed in/out during the await: these results may belong to the previous user. A new pass runs.
      state.privacyFlush = true;
      state.resync = true;
      return;
    }
    pass.now = Date.now();
    for (const [ckey, record] of [...state.contributions]) {
      if (desired.has(ckey)) continue;
      // A busy provider keeps its content, except user content at sign-in/out.
      const kept = keep.has(pendingKey(record.plugin, record.resourceId)) && !(pass.privacy && record.userScoped);
      if (!kept) this.retire(pass, ckey, record);
    }
    for (const [ckey, want] of desired) this.apply(pass, ckey, want);
    if (pass.blockedFor > 0 && !state.flushTimer) {
      state.flushTimer = setTimeout(() => {
        state.flushTimer = null;
        void this.sync(socket);
      }, pass.blockedFor + 5);
      state.flushTimer.unref?.();
    }
  }

  /** Removes user-scoped records sent under another card session than the current one. */
  private retireForeignUserContent(pass: Pass): void {
    for (const [ckey, record] of [...pass.state.contributions]) {
      if (record.userScoped && record.cardSessionId !== pass.cardSessionId) this.retire(pass, ckey, record);
    }
  }

  private async desired(socket: AuthenticatedWebSocket, state: UiSlotsState): Promise<Collected> {
    const empty: Collected = { desired: new Map(), keep: new Set() };
    const providers = this.registry.providers();
    if (providers.length === 0) return empty;
    const readerId = socket.readerId as number;
    const caps = state.capabilities;
    const resourceIds = await this.resourceIdsOf(readerId, state);
    const skipReason = this.readerSkipReason(caps, readerId);
    if (skipReason || !caps) {
      // Nothing is sent, but the admin view says why this reader shows no plugin content.
      for (const resourceId of resourceIds)
        for (const { plugin } of providers)
          skipProvider(empty.desired, plugin, resourceId, 'reader', skipReason ?? 'old-firmware');
      return empty;
    }
    const widgets = await this.settings.widgetToggles(readerId, resourceIds);
    const card = this.cardSessions.current(socket);
    return collectContributions({
      caps,
      readerId,
      resourceIds,
      providers,
      userId: card?.userId,
      language: card?.language ?? (await this.publicLanguage()),
      enabled: (resourceId, plugin) => widgets.readerEnabled && !widgets.disabled.has(`${resourceId}|${plugin}`),
      pending: state.pendingProviders,
      warn: (message) => this.logger.warn(message),
    });
  }

  private async resourceIdsOf(readerId: number, state: UiSlotsState): Promise<number[]> {
    if (state.resourceIds) return state.resourceIds;
    const loaded = (await this.attractapService.findReaderById(readerId))?.resources?.map((r) => r.id) ?? [];
    // A reader update during the read already stored newer ids.
    state.resourceIds ??= loaded;
    return state.resourceIds;
  }

  private async publicLanguage(): Promise<'en' | 'de'> {
    if (!this.defaultLanguage) this.defaultLanguage = await this.settingsService.getDefaultLanguage();
    return this.defaultLanguage;
  }

  /** Why a whole reader gets no plugin content, or null when it can show some. */
  private readerSkipReason(caps: ReaderUiCapabilities | null, readerId: number): string | null {
    if (!caps || caps.schemaVersion < 1) return 'old-firmware';
    if (caps.components.length === 0) return 'no-screen';
    return this.alerts.isReaderSuspended(readerId) ? 'crash-loop-suspended' : null;
  }

  /** A contribution the provider no longer returns: remove it from the reader if it may still show it. */
  private retire(pass: Pass, ckey: string, record: UiContributionRecord): void {
    if (record.sent) {
      if (!this.mayUpdate(pass, record, record)) return;
      this.send(pass, record, null);
    }
    pass.state.contributions.delete(ckey);
    this.clearTimer(pass.state, ckey);
  }

  private apply(pass: Pass, ckey: string, want: Desired): void {
    const { state } = pass;
    const have = state.contributions.get(ckey);
    if (have && have.hash === want.record.hash && have.status === want.record.status) return;
    if (want.tree === null) {
      // Skipped now (expired, invalid, over budget...): content the reader shows must go.
      if (have?.sent && !this.mayUpdate(pass, have, have)) return;
      const revision = have?.sent ? this.send(pass, have, null) : (state.revisions.get(ckey) ?? 0);
      state.contributions.set(ckey, { ...want.record, revision, sent: false });
      this.clearTimer(state, ckey);
      return;
    }
    // The first contribution of a slot is part of the initial sync; only updates to it are rate limited.
    if (!this.mayUpdate(pass, have, want.record)) return;
    const next: UiContributionRecord = { ...want.record, revision: 0, sent: true };
    if (next.userScoped) next.cardSessionId = pass.cardSessionId;
    next.revision = this.send(pass, next, want.tree);
    state.contributions.set(ckey, next);
    this.armExpiry(pass.socket, state, ckey, next.expiresAtMs);
  }

  /** Rate limit per resource and slot. A first send always passes; sign-in/out bypasses it for user content. */
  private mayUpdate(
    pass: Pass,
    have: UiContributionRecord | undefined,
    target: { resourceId: number; slot: string },
  ): boolean {
    if (pass.privacy && have && (have.userScoped || have.hash === FORGOTTEN)) return true;
    const wait = pass.state.limiter.take(`${target.resourceId}|${target.slot}`, pass.now);
    if (wait === 0 || !have) return true;
    pass.blockedFor = Math.max(pass.blockedFor, wait);
    return false;
  }

  /** Sends the next revision of a contribution and returns it. */
  private send(
    pass: Pass,
    record: Pick<UiContributionRecord, 'resourceId' | 'slot' | 'plugin' | 'key' | 'expiresAtMs'>,
    tree: unknown | null,
  ): number {
    const ckey = contributionKey(record.resourceId, record.slot, record.plugin, record.key);
    const revision = (pass.state.revisions.get(ckey) ?? 0) + 1;
    pass.state.revisions.set(ckey, revision);
    pass.state.inflight.set(ckey, revision);
    const payload = {
      resourceId: record.resourceId,
      slot: record.slot,
      revision,
      owner: record.plugin,
      key: record.key,
      serverNowMs: Date.now(),
      ...(record.expiresAtMs === undefined || tree === null ? {} : { expiresAtMs: record.expiresAtMs }),
      tree,
    };
    void pass.socket.sendMessage(new AttractapEvent(AttractapEventType.UI_SLOT_UPDATE, payload)).catch(() => undefined);
    return revision;
  }

  private armExpiry(socket: AuthenticatedWebSocket, state: UiSlotsState, ckey: string, expiresAtMs?: number): void {
    this.clearTimer(state, ckey);
    if (expiresAtMs === undefined) return;
    const timer = setTimeout(
      () => {
        state.timers.delete(ckey);
        void this.sync(socket);
      },
      Math.max(0, expiresAtMs - Date.now()) + 50,
    );
    timer.unref?.();
    state.timers.set(ckey, timer);
  }

  private clearTimer(state: UiSlotsState, ckey: string): void {
    const timer = state.timers.get(ckey);
    if (timer) clearTimeout(timer);
    state.timers.delete(ckey);
  }
}

/** Gateway retry loop: a pending UI_SLOT_UPDATE retry is dropped once a newer revision of the same contribution exists. */
export function isUiMessageSuperseded(
  socket: AuthenticatedWebSocket,
  message: { data: { type: string; payload?: Record<string, unknown> } },
): boolean {
  if (message.data.type !== AttractapEventType.UI_SLOT_UPDATE) return false;
  const p = message.data.payload ?? {};
  const latest = socket.state?.uiSlots?.inflight.get(
    contributionKey(Number(p['resourceId']), String(p['slot']), String(p['owner']), String(p['key'])),
  );
  return latest !== undefined && typeof p['revision'] === 'number' && latest > p['revision'];
}
