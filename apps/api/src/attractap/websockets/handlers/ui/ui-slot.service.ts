import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OnEvent } from '@nestjs/event-emitter';
import {
  READER_UI_LIMITS,
  READER_UI_SLOTS,
  READER_UI_TIMING,
  type ReaderSlotContribution,
  type ReaderUiCapabilities,
} from '@attraccess/plugins-backend-sdk';
import { AttractapService } from '../../../attractap.service';
import { validateReaderUiCapabilities, validateSlotUpdate } from '../../../../resources/forms/reader-ui.validation';
import { ReaderUiAlertsService } from '../../../../plugin-system/reader-ui/reader-ui-alerts.service';
import { ReaderUiSettingsService } from '../../../../plugin-system/reader-ui/reader-ui-settings.service';
import {
  READER_UI_INVALIDATE_EVENT,
  ReaderUiRegistry,
  type ReaderUiInvalidation,
} from '../../../../plugin-system/reader-ui/reader-ui.registry';
import { AttractapEvent, AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import { WebsocketService } from '../../websocket.service';
import { CardSessionService } from './card-session.service';
import { UiSlotRateLimiter } from './ui-rate-limiter';
import { countNodes, fallbackTree, readerCanRender, toWireTree, treeHash } from './ui-slot-builder';
import { contributionKey, type UiContributionRecord, type UiSlotsState } from './ui-socket-state';

interface Desired {
  ckey: string;
  record: Omit<UiContributionRecord, 'revision'>;
  tree: unknown | null;
}

const DETAILS_SLOTS: string[] = [
  READER_UI_SLOTS.RESOURCE_DETAILS_HEADER,
  READER_UI_SLOTS.RESOURCE_DETAILS_BODY,
  READER_UI_SLOTS.RESOURCE_DETAILS_SESSION,
];

/** Pushes plugin slot contributions to a reader and keeps its view of them in step (UI_SLOT_UPDATE). */
@Injectable()
export class UiSlotService {
  private readonly logger = new Logger(UiSlotService.name);
  private readonly limiter = new UiSlotRateLimiter(READER_UI_TIMING.slotUpdateMinIntervalMs);

  constructor(
    private readonly registry: ReaderUiRegistry,
    private readonly settings: ReaderUiSettingsService,
    private readonly alerts: ReaderUiAlertsService,
    private readonly attractapService: AttractapService,
    private readonly websocketService: WebsocketService,
    private readonly cardSessions: CardSessionService,
  ) {
    cardSessions.onStarted((socket) => void this.sync(socket));
    cardSessions.onEnded((socket) => void this.sync(socket));
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
    state.flushTimer = null;
    state.inflight.clear();
  }

  /** UI_RENDER_REPORT: the reader says what it did with a contribution. */
  renderReport(socket: AuthenticatedWebSocket, payload: Record<string, unknown>): void {
    const state = socket.state.uiSlots;
    if (!state || typeof payload?.owner !== 'string') return;
    const record = state.contributions.get(
      contributionKey(Number(payload.resourceId), String(payload.slot), payload.owner, String(payload.key)),
    );
    if (!record || payload.revision !== record.revision) return;
    if (payload.status === 'dropped') {
      record.status = 'skipped';
      record.reason = `reader-${String(payload.reason ?? 'dropped').slice(0, 32)}`;
    }
  }

  contributionsOf(readerId: number) {
    const socket = [...this.websocketService.sockets.values()].find((s) => s.readerId === readerId);
    return [...(socket?.state.uiSlots?.contributions.values() ?? [])].map(
      ({ plugin, resourceId, slot, key, status, reason }) => ({ plugin, resourceId, slot, key, status, reason }),
    );
  }

  @OnEvent(READER_UI_INVALIDATE_EVENT)
  onInvalidate(event: ReaderUiInvalidation): void {
    for (const socket of this.websocketService.sockets.values()) {
      if (socket.readerId == null || !socket.state.uiSlots?.capabilities) continue;
      if (event.scope.readerId !== undefined && event.scope.readerId !== socket.readerId) continue;
      void this.sync(socket);
    }
  }

  syncReader(readerId: number | undefined): void {
    for (const socket of this.websocketService.sockets.values()) {
      if (readerId === undefined || socket.readerId === readerId) void this.sync(socket);
    }
  }

  async sync(socket: AuthenticatedWebSocket): Promise<void> {
    const state = socket.state.uiSlots;
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

  private freshState(capabilities: ReaderUiCapabilities | null): UiSlotsState {
    return {
      epoch: randomBytes(4).toString('hex'),
      capabilities,
      inflight: new Map(),
      contributions: new Map(),
      timers: new Map(),
      flushTimer: null,
      syncing: false,
      resync: false,
    };
  }

  private async syncOnce(socket: AuthenticatedWebSocket, state: UiSlotsState): Promise<void> {
    const caps = state.capabilities;
    const readerId = socket.readerId as number;
    const desired = new Map<string, Desired>();
    if (caps && caps.schemaVersion >= 1 && caps.components.length > 0 && !this.alerts.isReaderSuspended(readerId)) {
      const reader = await this.attractapService.findReaderById(readerId);
      for (const resource of reader?.resources ?? []) {
        await this.collect(socket, caps, readerId, resource.id, desired);
      }
    }
    this.applyNodeBudget(desired);
    const now = Date.now();
    let blockedFor = 0;
    for (const [ckey, record] of [...state.contributions]) {
      if (desired.has(ckey)) continue;
      if (record.status === 'skipped' && record.revision === 0) {
        state.contributions.delete(ckey);
        continue;
      }
      const wait = this.limiter.take(`${state.epoch}|${record.resourceId}|${record.slot}`, now);
      if (wait > 0) {
        blockedFor = Math.max(blockedFor, wait);
        continue;
      }
      this.send(socket, state, record, record.revision + 1, null);
      state.contributions.delete(ckey);
      this.clearTimer(state, ckey);
    }
    for (const [ckey, want] of desired) {
      const have = state.contributions.get(ckey);
      if (have && have.hash === want.record.hash && have.status === want.record.status) continue;
      if (want.tree === null) {
        state.contributions.set(ckey, { ...want.record, revision: have?.revision ?? 0 });
        continue;
      }
      // The first contribution of a slot is part of the initial sync; only updates to it are rate limited.
      const wait = this.limiter.take(`${state.epoch}|${want.record.resourceId}|${want.record.slot}`, now);
      if (wait > 0 && have) {
        blockedFor = Math.max(blockedFor, wait);
        continue;
      }
      const revision = (have?.revision ?? 0) + 1;
      const next = { ...want.record, revision };
      state.contributions.set(ckey, next);
      this.send(socket, state, next, revision, want.tree);
      this.armExpiry(socket, state, ckey, next.expiresAtMs);
    }
    if (blockedFor > 0 && !state.flushTimer) {
      state.flushTimer = setTimeout(() => {
        state.flushTimer = null;
        void this.sync(socket);
      }, blockedFor + 5);
      state.flushTimer.unref?.();
    }
  }

  private async collect(
    socket: AuthenticatedWebSocket,
    caps: ReaderUiCapabilities,
    readerId: number,
    resourceId: number,
    desired: Map<string, Desired>,
  ): Promise<void> {
    const card = this.cardSessions.current(socket);
    const language = card?.language ?? this.websocketService.readerLanguage ?? 'en';
    let perResource = 0;
    for (const { plugin, provider } of this.registry.providers()) {
      if (!(await this.settings.widgetsEnabled(resourceId, plugin, readerId))) continue;
      let list: ReaderSlotContribution[];
      try {
        list = await Promise.race([
          Promise.resolve(
            provider.getSlotContributions({ readerId, resourceId, userId: card?.userId, capabilities: caps, language }),
          ),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500).unref?.()),
        ]);
      } catch (error) {
        this.logger.warn(`Plugin ${plugin} slot provider failed: ${(error as Error).message}`);
        this.skip(desired, plugin, resourceId, 'provider', 'provider-error');
        continue;
      }
      for (const contribution of list ?? []) {
        perResource += 1;
        this.prepare(
          desired,
          caps,
          plugin,
          resourceId,
          contribution,
          perResource > READER_UI_LIMITS.maxSlotContributionsPerResource,
        );
      }
    }
  }

  private prepare(
    desired: Map<string, Desired>,
    caps: ReaderUiCapabilities,
    plugin: string,
    resourceId: number,
    c: ReaderSlotContribution,
    overLimit: boolean,
  ): void {
    const base = { plugin, resourceId, slot: String(c.slotId), key: String(c.key) };
    const ckey = contributionKey(resourceId, base.slot, plugin, base.key);
    const skip = (reason: string): void => {
      desired.set(ckey, { ckey, tree: null, record: { ...base, hash: reason, nodes: 0, status: 'skipped', reason } });
    };
    const expiresAtMs = c.expiresAt ? new Date(c.expiresAt).getTime() : undefined;
    if (overLimit) return skip('too-many-contributions');
    if (expiresAtMs !== undefined && expiresAtMs <= Date.now()) return skip('expired');
    let tree: unknown = toWireTree(c.tree);
    let status: 'rendered' | 'degraded' = 'rendered';
    if (!readerCanRender(caps, base.slot, c)) {
      if (!c.fallback || !caps.slots.includes(base.slot)) return skip('unsupported');
      tree = fallbackTree(base.slot, c.fallback);
      status = 'degraded';
    }
    const checked = validateSlotUpdate({
      resourceId,
      slot: base.slot,
      revision: 1,
      owner: plugin.slice(0, 64),
      key: base.key,
      serverNowMs: Date.now(),
      ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
      tree,
    });
    if ('reason' in checked) {
      this.logger.warn(`Rejected a ${base.slot} contribution of plugin ${plugin}: ${checked.reason}`);
      return skip(`invalid-${checked.reason}`);
    }
    const wireTree = checked.value.payload['tree'];
    desired.set(ckey, {
      ckey,
      tree: wireTree,
      record: { ...base, hash: treeHash(wireTree, expiresAtMs), nodes: countNodes(wireTree), status, expiresAtMs },
    });
  }

  private skip(desired: Map<string, Desired>, plugin: string, resourceId: number, key: string, reason: string) {
    const ckey = contributionKey(resourceId, 'provider', plugin, key);
    desired.set(ckey, {
      ckey,
      tree: null,
      record: { plugin, resourceId, slot: 'provider', key, hash: reason, nodes: 0, status: 'skipped', reason },
    });
  }

  /** At most `maxLiveNodes` plugin nodes in resource-details slots per reader; the rest is skipped. */
  private applyNodeBudget(desired: Map<string, Desired>): void {
    let live = 0;
    for (const want of desired.values()) {
      if (want.tree === null || !DETAILS_SLOTS.includes(want.record.slot)) continue;
      live += want.record.nodes;
      if (live > READER_UI_LIMITS.maxLiveNodes) {
        want.tree = null;
        want.record.status = 'skipped';
        want.record.reason = 'node-budget';
        want.record.hash = 'node-budget';
      }
    }
  }

  private send(
    socket: AuthenticatedWebSocket,
    state: UiSlotsState,
    record: Omit<UiContributionRecord, 'revision'> & { revision?: number },
    revision: number,
    tree: unknown | null,
  ): void {
    const ckey = contributionKey(record.resourceId, record.slot, record.plugin, record.key);
    state.inflight.set(ckey, revision);
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
    void socket.sendMessage(new AttractapEvent(AttractapEventType.UI_SLOT_UPDATE, payload)).catch(() => undefined);
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
