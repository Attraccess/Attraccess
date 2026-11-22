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
import { MatterConnectionService, STOP_GRACE_MS } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterChangeBus } from '../devices/change-bus';
import type { MatterNode } from '../devices/entities';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { conflict, forbidden } from '../fabric/errors';
import { MatterFabricService } from '../fabric/fabric.service';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage } from '../plugin-storage/access';
import { INSECURE_SETUP_CODE, startFailure } from './errors';
import { MatterOperationGate } from './operation-gate';
import type { FinishInput, StartInput } from './schemas';
import { isActive, sessionView, type Session, type SessionView } from './session';
import {
  COMMISSIONING_TIMING,
  CommissioningSessionTracker,
  DEFAULT_TIMING,
  type CommissioningTiming,
} from './session-tracker';
import { CommissioningSettlement } from './settlement';

export { COMMISSIONING_TIMING, type CommissioningTiming };

/** The cancel a stopping plugin sends to a running session: short, the stop must not wait long. */
const SHUTDOWN_CANCEL_TIMEOUT_MS = 2_000;

/**
 * The plugin's side of commissioning. A session starts on the sidecar, which runs it asynchronously; the tracker
 * follows it by event and by polling, and the settlement writes the registry rows only when the sidecar reported
 * success and the plugin read the node itself. Sessions live in memory: a restart of either side ends one as
 * `interrupted`, and the administrator starts again with a freshly entered code. Nothing here ever holds or logs a
 * setup code.
 */
@Injectable()
export class MatterCommissioningService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribe: (() => void)[] = [];
  private readonly settlement: CommissioningSettlement;
  private readonly tracker: CommissioningSessionTracker;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService)
    private readonly connectionService: Pick<MatterConnectionService, 'connection'> &
      Partial<Pick<MatterConnectionService, 'beforeStopping'>>,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterChangeBus) private readonly changes: MatterChangeBus,
    @Inject(MatterOperationGate) private readonly gate: MatterOperationGate,
    @Inject(MatterFabricService) fabric: Pick<MatterFabricService, 'detect'>,
    @Inject(MatterReconciliationService) reconciliation: Pick<MatterReconciliationService, 'request'>,
    @Optional() @Inject(COMMISSIONING_TIMING) timing?: CommissioningTiming,
  ) {
    const connection = () => this.connectionService.connection;
    this.settlement = new CommissioningSettlement({ context, connection, audit, changes, fabric, reconciliation });
    this.tracker = new CommissioningSessionTracker({
      connection,
      settlement: this.settlement,
      timing: timing ?? DEFAULT_TIMING,
      warn: (message) => context.logger.warn?.(message),
    });
  }

  private get connection() {
    return this.connectionService.connection;
  }

  private get storage() {
    return matterStorage(this.context);
  }

  onModuleInit(): void {
    this.unsubscribe.push(...this.tracker.listen());
    // Runs before the connection closes when the plugin stops; left registered, it is idempotent.
    this.connectionService.beforeStopping?.(() => this.shutdown());
  }

  /** Ends running sessions as interrupted (`plugin_restart`) and cancels them on the sidecar. Bounded. */
  async onModuleDestroy(): Promise<void> {
    for (const stop of this.unsubscribe.splice(0)) stop();
    this.tracker.stop();
    let timer: NodeJS.Timeout | undefined;
    const grace = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, STOP_GRACE_MS);
      timer.unref();
    });
    await Promise.race([this.shutdown(), grace]);
    clearTimeout(timer);
  }

  private async shutdown(): Promise<void> {
    const active = [...this.tracker.sessions.values()].filter((session) => isActive(session) && !session.settling);
    await Promise.allSettled(
      active.map(async (session) => {
        // The cancel goes first, with a short deadline: the connection closes right after this.
        const cancelled = this.settlement.cancelOnSidecar(session.sidecarSessionId, SHUTDOWN_CANCEL_TIMEOUT_MS);
        await this.settlement.interrupt(session, 'plugin_restart');
        await cancelled;
      }),
    );
  }

  // --- the REST operations -----------------------------------------------------------------------------------------

  /** Starts a session on the sidecar. `input.setupCode` is passed on and dropped: nothing keeps it. */
  async start(input: StartInput, principal: PluginAuditPrincipal): Promise<SessionView> {
    this.guard.assertFabricMutationAllowed();
    const release = this.gate.enter('commissioning');
    let sidecar: CommissioningSession;
    try {
      const status = this.connection.status();
      if (status.state !== 'connected') {
        throw conflict('sidecar_unavailable', 'The Matter sidecar is not connected.');
      }
      // The setup code is a secret: never sent over plain HTTP to another machine.
      if (status.insecureTransport) throw forbidden('insecure_transport', INSECURE_SETUP_CODE);
      sidecar = await this.tracker.requestStart(input);
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
      finishing: false,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      sidecarSessionId: sidecar.sessionId,
      streamInstanceId: this.tracker.currentStreamInstanceId,
      settling: false,
      unreachable: 0,
    };
    this.settlement.holdGate(release);
    this.tracker.track(session);
    try {
      await this.settlement.record('matter.commissioning_started', session, {
        attestationOverride: session.overrideRequested,
      });
    } catch (error) {
      // Not audited, not run: the session ends at once and the sidecar's is cancelled.
      await this.settlement.abandon(session, error);
      return sessionView(session);
    }
    await this.settlement.apply(session, sidecar);
    return sessionView(session);
  }

  get(id: string, userId: number): SessionView {
    return sessionView(this.tracker.owned(id, userId));
  }

  /** The caller's newest session that is running, or succeeded and not yet named. Null when there is none. */
  current(userId: number): SessionView | null {
    const mine = [...this.tracker.sessions.values()]
      .filter((session) => session.userId === userId)
      .filter((session) => isActive(session) || (session.state === 'succeeded' && !session.finished))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return mine[0] ? sessionView(mine[0]) : null;
  }

  async cancel(id: string, userId: number): Promise<SessionView> {
    const session = this.tracker.owned(id, userId);
    if (!isActive(session) || session.settling) return sessionView(session);
    try {
      const sidecar = await this.connection.request('commissioning.cancel', {
        params: { sessionId: session.sidecarSessionId },
      });
      await this.settlement.apply(session, sidecar);
    } catch (error) {
      if (error instanceof SidecarClientError && error.code === 'not_found') {
        await this.settlement.interrupt(session, 'sidecar_restart');
      } else if (isActive(session) && !session.settling) {
        // The sidecar cannot confirm: the session ends here, and a late success becomes an unclaimed node.
        await this.settlement.interrupt(session, 'connection_lost');
      }
    }
    return sessionView(session);
  }

  /** The naming step: names the node and its endpoints. Only the user who commissioned, once, after success. */
  async finish(id: string, userId: number, input: FinishInput): Promise<MatterNode> {
    const session = this.tracker.owned(id, userId);
    if (session.state !== 'succeeded' || session.nodeRecordId === null) {
      throw conflict('not_succeeded', 'Only a commissioning session that succeeded can be finished.');
    }
    if (session.finished || session.finishing) {
      throw conflict('already_finished', 'This session was already finished.');
    }
    const nodeRef = session.nodeRecordId;
    const owned = new Set(session.endpoints.map((endpoint) => endpoint.id));
    for (const entry of input.endpoints ?? []) {
      if (!owned.has(entry.id)) throw new NotFoundException('Unknown endpoint of this node.');
    }
    // Before the first await: a second request arriving meanwhile is refused instead of writing and auditing again.
    session.finishing = true;
    let node: MatterNode;
    const now = new Date().toISOString();
    try {
      node = await this.name(nodeRef, input, now);
    } catch (error) {
      session.finishing = false;
      throw error;
    }
    session.finished = true;
    session.finishing = false;
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

  private name(nodeRef: string, input: FinishInput, now: string): Promise<MatterNode> {
    return this.storage.transaction(async (tables) => {
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
  }
}
