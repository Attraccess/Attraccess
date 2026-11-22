import type { CommissioningSession } from '@attraccess/matter-contract';
import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SidecarClientError } from '../client/errors';
import type { StreamEvent } from '../client/event-stream';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterChangeBus } from '../devices/change-bus';
import type { MatterNode } from '../devices/entities';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { conflict } from '../fabric/errors';
import { MatterFabricService } from '../fabric/fabric.service';
import { recordedFabricRow } from '../fabric/facts';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage } from '../plugin-storage/access';
import { startFailure } from './errors';
import { MatterOperationGate } from './operation-gate';
import { registerCommissionedNode, RegistryConflictError } from './registry-writer';
import type { FinishInput, StartInput } from './schemas';
import {
  isActive,
  sessionView,
  type ExistingAction,
  type Session,
  type SessionFailure,
  type SessionView,
} from './session';

export const COMMISSIONING_TIMING = Symbol.for('attraccess.matter.commissioning-timing');
export type CommissioningTiming = {
  /** How often the sidecar is asked about a running session, besides its events. */
  pollMs: number;
  /** Longest a session may run: the sidecar's own deadline plus a margin. Then it ends as `interrupted`. */
  maxMs: number;
  /** Polls in a row that cannot reach the sidecar before the session ends as `interrupted`. */
  maxUnreachablePolls: number;
  /** How long a finished session stays readable. */
  retainMs: number;
};
const DEFAULT_TIMING: CommissioningTiming = {
  pollMs: 1_500,
  maxMs: 7 * 60_000,
  maxUnreachablePolls: 4,
  retainMs: 3_600_000,
};

type InterruptReason = 'sidecar_restart' | 'connection_lost' | 'timeout' | 'plugin_restart';
const SUBJECT = 'matter.commissioning_session' as const;

/**
 * The plugin's side of commissioning. A session starts on the sidecar, which runs it asynchronously; this service
 * follows it by event and by polling, and writes the registry rows only when the sidecar reported success and the
 * plugin read the node itself. Sessions live in memory: a restart of either side ends one as `interrupted`, and the
 * administrator starts again with a freshly entered code. Nothing here ever holds or logs a setup code.
 */
@Injectable()
export class MatterCommissioningService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, Session>();
  private readonly unsubscribe: (() => void)[] = [];
  private readonly timing: CommissioningTiming;
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  private streamInstanceId: string | null = null;
  private releaseGate: (() => void) | null = null;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterChangeBus) private readonly changes: MatterChangeBus,
    @Inject(MatterOperationGate) private readonly gate: MatterOperationGate,
    @Inject(MatterFabricService) private readonly fabric: Pick<MatterFabricService, 'detect'>,
    @Inject(MatterReconciliationService) private readonly reconciliation: Pick<MatterReconciliationService, 'request'>,
    @Optional() @Inject(COMMISSIONING_TIMING) timing?: CommissioningTiming,
  ) {
    this.timing = timing ?? DEFAULT_TIMING;
  }

  private get connection() {
    return this.connectionService.connection;
  }

  private get storage() {
    return matterStorage(this.context);
  }

  onModuleInit(): void {
    const connection = this.connection;
    this.unsubscribe.push(
      connection.onEvent((event) => this.onEvent(event)),
      connection.onStateChange((status) => {
        if (status.state !== 'connected') this.interruptAll('connection_lost');
      }),
    );
  }

  onModuleDestroy(): void {
    for (const stop of this.unsubscribe.splice(0)) stop();
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // --- the REST operations -----------------------------------------------------------------------------------------

  /** Starts a session on the sidecar. `input.setupCode` is passed on and dropped: nothing keeps it. */
  async start(input: StartInput, principal: PluginAuditPrincipal): Promise<SessionView> {
    this.guard.assertFabricMutationAllowed();
    const release = this.gate.enter('commissioning');
    let sidecar: CommissioningSession;
    try {
      if (this.connection.status().state !== 'connected') {
        throw conflict('sidecar_unavailable', 'The Matter sidecar is not connected.');
      }
      sidecar = await this.connection.request('commissioning.start', {
        body: {
          setupCode: input.setupCode,
          ...(input.attestationOverride ? { attestationOverride: input.attestationOverride } : {}),
        },
      });
    } catch (error) {
      release();
      throw error instanceof SidecarClientError ? startFailure(error) : error;
    }
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      userId: principal.userId,
      principal,
      state: 'pending',
      step: null,
      failure: null,
      attestation: null,
      overrideRequested: input.attestationOverride !== undefined,
      overrideAvailable: sidecar.attestationOverrideAllowed,
      nodeRecordId: null,
      endpoints: [],
      finished: false,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      sidecarSessionId: sidecar.sessionId,
      streamInstanceId: this.streamInstanceId,
      settling: false,
      unreachable: 0,
    };
    this.releaseGate = release;
    this.prune();
    this.sessions.set(session.id, session);
    await this.record('matter.commissioning_started', session, {
      attestationOverride: session.overrideRequested,
    });
    this.startPolling();
    await this.apply(session, sidecar);
    return sessionView(session);
  }

  get(id: string, userId: number): SessionView {
    return sessionView(this.owned(id, userId));
  }

  /** The caller's newest session that is running, or succeeded and not yet named. Null when there is none. */
  current(userId: number): SessionView | null {
    const mine = [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .filter((session) => isActive(session) || (session.state === 'succeeded' && !session.finished))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return mine[0] ? sessionView(mine[0]) : null;
  }

  async cancel(id: string, userId: number): Promise<SessionView> {
    const session = this.owned(id, userId);
    if (!isActive(session) || session.settling) return sessionView(session);
    try {
      const sidecar = await this.connection.request('commissioning.cancel', {
        params: { sessionId: session.sidecarSessionId },
      });
      await this.apply(session, sidecar);
    } catch (error) {
      if (error instanceof SidecarClientError && error.code === 'not_found') {
        await this.interrupt(session, 'sidecar_restart');
      } else if (isActive(session) && !session.settling) {
        // The sidecar cannot confirm: the session ends here, and a late success becomes an unclaimed node.
        await this.interrupt(session, 'connection_lost');
      }
    }
    return sessionView(session);
  }

  /** The naming step: names the node and its endpoints. Only the user who commissioned, once, after success. */
  async finish(id: string, userId: number, input: FinishInput): Promise<MatterNode> {
    const session = this.owned(id, userId);
    if (session.state !== 'succeeded' || session.nodeRecordId === null) {
      throw conflict('not_succeeded', 'Only a commissioning session that succeeded can be finished.');
    }
    if (session.finished) throw conflict('already_finished', 'This session was already finished.');
    const nodeRef = session.nodeRecordId;
    const owned = new Set(session.endpoints.map((endpoint) => endpoint.id));
    for (const entry of input.endpoints ?? []) {
      if (!owned.has(entry.id)) throw new NotFoundException('Unknown endpoint of this node.');
    }
    const now = new Date().toISOString();
    const node = await this.storage.transaction(async (tables) => {
      const node = await tables.nodes.get(nodeRef);
      if (!node || node.lifecycleState === 'removed') {
        throw conflict('node_removed', 'The node is no longer in the registry.');
      }
      const patch = {
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.location === undefined ? {} : { location: input.location }),
      };
      if (Object.keys(patch).length > 0) {
        await tables.nodes.update({ id: node.id }, { ...patch, updatedAt: now });
        Object.assign(node, patch, { updatedAt: now });
      }
      for (const entry of input.endpoints ?? []) {
        await tables.endpoints.update({ id: entry.id, nodeRef }, { displayName: entry.displayName });
      }
      return node;
    });
    session.finished = true;
    session.updatedAt = now;
    this.changes.inventoryChanged();
    await this.audit.record(
      'matter.commissioning_finished',
      session.principal,
      { type: 'matter.node', ref: nodeRef },
      {
        nodeRef,
        sessionRef: session.id,
        nameSet: input.displayName !== undefined,
        locationSet: input.location !== undefined,
        endpointNames: input.endpoints?.length ?? 0,
      },
    );
    return node;
  }

  // --- following the sidecar ---------------------------------------------------------------------------------------

  private owned(id: string, userId: number): Session {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) throw new NotFoundException('Unknown commissioning session.');
    return session;
  }

  private onEvent({ event }: StreamEvent): void {
    const previous = this.streamInstanceId;
    this.streamInstanceId = event.streamInstanceId;
    if (previous !== null && previous !== event.streamInstanceId) {
      // Another sidecar run: whatever it was commissioning is gone with its memory.
      for (const session of this.activeSessions()) void this.interrupt(session, 'sidecar_restart');
    }
    for (const session of this.activeSessions()) session.streamInstanceId ??= event.streamInstanceId;
    if (event.type !== 'commissioning.progress') return;
    const payload = event.payload as { sessionId?: string; state?: string };
    const session = [...this.sessions.values()].find((entry) => entry.sidecarSessionId === payload.sessionId);
    if (session) {
      if (isActive(session) && !session.settling) void this.refresh(session);
    } else if (payload.state === 'succeeded') {
      // A session this plugin does not know (it restarted meanwhile) finished: its node surfaces as unclaimed.
      void this.record('matter.commissioning_interrupted', null, { reason: 'plugin_restart' }, randomUUID());
      void this.reconciliation.request().catch(() => undefined);
    }
  }

  private activeSessions(): Session[] {
    return [...this.sessions.values()].filter((session) => isActive(session) && !session.settling);
  }

  private startPolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.timing.pollMs);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const session of this.activeSessions()) {
        if (Date.now() - Date.parse(session.startedAt) > this.timing.maxMs) {
          await this.connection
            .request('commissioning.cancel', { params: { sessionId: session.sidecarSessionId } })
            .catch(() => undefined);
          await this.interrupt(session, 'timeout');
        } else {
          await this.refresh(session);
        }
      }
    } finally {
      this.polling = false;
      if (![...this.sessions.values()].some(isActive)) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }
  }

  /** Reads the session from the sidecar. `not_found` means the sidecar restarted since it started the session. */
  private async refresh(session: Session): Promise<void> {
    if (!isActive(session) || session.settling) return;
    let sidecar: CommissioningSession;
    try {
      sidecar = await this.connection.request('commissioning.get', { params: { sessionId: session.sidecarSessionId } });
    } catch (error) {
      if (error instanceof SidecarClientError && error.code === 'not_found')
        return this.interrupt(session, 'sidecar_restart');
      session.unreachable += 1;
      if (session.unreachable >= this.timing.maxUnreachablePolls) return this.interrupt(session, 'connection_lost');
      return;
    }
    session.unreachable = 0;
    await this.apply(session, sidecar);
  }

  /** Takes over what the sidecar says about the session. Terminal outcomes are handled once. */
  private async apply(session: Session, sidecar: CommissioningSession): Promise<void> {
    if (!isActive(session) || session.settling) return;
    session.step = sidecar.step;
    session.overrideAvailable = sidecar.attestationOverrideAllowed;
    const overriddenBefore = session.attestation?.status === 'overridden';
    session.attestation = sidecar.attestation;
    session.updatedAt = new Date().toISOString();
    if (sidecar.attestation?.status === 'overridden' && !overriddenBefore) {
      // A dangerous action: audited as its own entry with the finding types, never anything of the certificate chain.
      await this.record('matter.commissioning_attestation_overridden', session, {
        findings: sidecar.attestation.findings.join(','),
      });
    }
    if (sidecar.state === 'pending' || sidecar.state === 'running') {
      session.state = sidecar.state;
      return;
    }
    session.settling = true;
    if (sidecar.state === 'failed') return this.settleFailure(session, sidecar);
    if (sidecar.nodeId === null) return this.fail(session, { code: 'internal' });
    await this.register(session, sidecar.nodeId);
  }

  private async settleFailure(session: Session, sidecar: CommissioningSession): Promise<void> {
    const failure = sidecar.failure ?? { code: 'internal' as const };
    if (failure.code === 'interrupted') return this.interrupt(session, 'sidecar_restart', true);
    if (failure.code === 'already_commissioned') {
      const existing = await this.existingRecord(failure.existingNodeId);
      return this.fail(session, { code: failure.code, existing }, failure.existingNodeId);
    }
    await this.fail(session, {
      code: failure.code,
      ...(failure.attestationFindings ? { attestationFindings: failure.attestationFindings } : {}),
    });
  }

  /** The registry's record of a node the device already is, and what the administrator can do about it. */
  private async existingRecord(nodeId: string | undefined): Promise<NonNullable<SessionFailure['existing']>> {
    const none = { nodeRecordId: null, lifecycleState: null, action: 'reconcile' as ExistingAction };
    if (nodeId === undefined) return none;
    const { tables } = this.storage;
    const recorded = await recordedFabricRow(tables);
    const fabrics = recorded ? [recorded] : await tables.fabrics.find({ where: { retiredAt: null } });
    const rows = await tables.nodes.find({
      where: { nodeId, fabricRef: { in: fabrics.map((entry) => entry.id) } },
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
    const record = rows.find((row) => row.lifecycleState !== 'removed') ?? null;
    if (!record) return none;
    const action: Record<string, ExistingAction> = {
      claimed: 'open',
      unclaimed: 'open',
      detached: 'repair',
      archived: 'restore',
    };
    return {
      nodeRecordId: record.id,
      lifecycleState: record.lifecycleState,
      action: action[record.lifecycleState] ?? 'reconcile',
    };
  }

  /**
   * The sidecar reported success. The session counts as succeeded only after the plugin read the node itself, the
   * fabric matches the one it recorded, and the rows were written in one transaction.
   */
  private async register(session: Session, nodeId: string): Promise<void> {
    let registered;
    let fabricId = '0';
    try {
      const sidecarFabric = await this.connection.request('fabric.get');
      const view = await this.connection.request('inventory.get', { params: { nodeId } });
      // The own change is recorded now: the generation moved because of this session, not because of a restore.
      await this.fabric.detect('event').catch(() => undefined);
      const recorded = await recordedFabricRow(this.storage.tables);
      if (sidecarFabric.fabricId === null || (recorded && recorded.fabricId !== sidecarFabric.fabricId)) {
        return this.needsReconciliation(session, 'needs_reconciliation');
      }
      fabricId = sidecarFabric.fabricId;
      const now = new Date().toISOString();
      registered = await this.storage.transaction((tables) =>
        registerCommissionedNode(tables, {
          fabricId,
          view,
          userId: session.userId,
          overridden: session.attestation?.status === 'overridden',
          now,
        }),
      );
    } catch (error) {
      return this.needsReconciliation(
        session,
        error instanceof RegistryConflictError ? 'needs_reconciliation' : 'registry_failed',
      );
    }
    session.nodeRecordId = registered.node.id;
    session.endpoints = registered.endpoints.map((endpoint) => ({
      endpointId: endpoint.endpointId,
      id: endpoint.id,
      displayName: endpoint.displayName,
    }));
    session.state = 'succeeded';
    session.step = 'completed';
    this.finishSession(session);
    this.changes.inventoryChanged();
    await this.audit.record(
      'matter.node_commissioned',
      session.principal,
      { type: 'matter.node', ref: registered.node.id },
      {
        nodeRef: registered.node.id,
        fabricId,
        nodeId: registered.node.nodeId,
        sessionRef: session.id,
        attestation: session.attestation?.status === 'overridden' ? 'overridden' : 'verified',
      },
    );
  }

  /** The device joined the fabric but the registry could not take it: the next reconciliation lists it as unclaimed. */
  private async needsReconciliation(session: Session, code: 'needs_reconciliation' | 'registry_failed'): Promise<void> {
    await this.fail(session, { code });
    void this.reconciliation.request().catch(() => undefined);
  }

  private async fail(session: Session, failure: SessionFailure, existingNodeId?: string): Promise<void> {
    session.state = 'failed';
    session.failure = failure;
    this.finishSession(session);
    if (failure.code === 'cancelled') {
      await this.record('matter.commissioning_cancelled', session, {});
      return;
    }
    await this.record('matter.commissioning_failed', session, {
      failure: failure.code,
      ...(session.step ? { step: session.step } : {}),
      ...(failure.attestationFindings ? { findings: failure.attestationFindings.join(',') } : {}),
      ...(existingNodeId === undefined ? {} : { existingNodeId }),
    });
  }

  /** `force`: the caller already holds the session's terminal handling (the sidecar itself reported the interruption). */
  private async interrupt(session: Session, reason: InterruptReason, force = false): Promise<void> {
    if (!isActive(session) || (session.settling && !force)) return;
    session.settling = true;
    session.state = 'interrupted';
    session.failure = { code: 'interrupted' };
    this.finishSession(session);
    await this.record('matter.commissioning_interrupted', session, { reason });
    // The device's fail-safe rolls back a half-done attempt; one that completed on the sidecar shows up as unclaimed.
    void this.reconciliation.request().catch(() => undefined);
  }

  private interruptAll(reason: InterruptReason): void {
    for (const session of this.activeSessions()) void this.interrupt(session, reason);
  }

  private finishSession(session: Session): void {
    const now = new Date().toISOString();
    session.updatedAt = now;
    session.finishedAt = now;
    session.settling = false;
    // One session at a time: the gate it held is free again.
    this.releaseGate?.();
    this.releaseGate = null;
  }

  private prune(): void {
    const limit = Date.now() - this.timing.retainMs;
    for (const [id, session] of this.sessions) {
      if (session.finishedAt !== null && Date.parse(session.finishedAt) < limit) this.sessions.delete(id);
    }
  }

  private record(
    action: string,
    session: Session | null,
    details: Record<string, string | number | boolean>,
    ref: string = session?.id ?? randomUUID(),
  ): Promise<void> {
    return this.audit.record(
      action,
      session?.principal ?? null,
      { type: SUBJECT, ref },
      { sessionRef: ref, ...details },
    );
  }
}
