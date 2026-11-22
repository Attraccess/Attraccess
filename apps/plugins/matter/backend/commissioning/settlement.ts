// The terminal half of a commissioning session: what the plugin does once the sidecar reports an outcome, or once the
// plugin itself ends a session (interruption). Every path ends the session and frees the operation gate, also when the
// database or the audit fails on the way: a session must never stay running and keep every fabric operation `busy`.
import type { CommissioningSession } from '@attraccess/matter-contract';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';
import type { SidecarConnection } from '../client/connection';
import { redactSecrets, SidecarClientError } from '../client/errors';
import type { InterruptReason } from '../connection/audit';
import type { DeviceAuditService } from '../devices/audit.service';
import type { MatterChangeBus } from '../devices/change-bus';
import type { MatterReconciliationService } from '../devices/reconciliation.service';
import type { MatterFabricService } from '../fabric/fabric.service';
import { recordedFabricRow } from '../fabric/facts';
import { matterStorage } from '../plugin-storage/access';
import { registerCommissionedNode, RegistryConflictError, type RegisteredNode } from './registry-writer';
import { isActive, type ExistingAction, type FailureCode, type Session, type SessionFailure } from './session';

const SUBJECT = 'matter.commissioning_session' as const;
/** Failures after which the device may have joined the fabric anyway: a reconciliation lists it as unclaimed. */
const RECONCILE_AFTER: ReadonlySet<FailureCode> = new Set<FailureCode>([
  'internal',
  'case_failed',
  'timeout',
  'needs_reconciliation',
  'registry_failed',
]);
/**
 * Interruptions after which the sidecar may still run the session: it is cancelled there, nothing resumes. A stopping
 * plugin sends its own, shorter cancel (`plugin_restart`).
 */
const CANCEL_ON: ReadonlySet<InterruptReason> = new Set<InterruptReason>(['connection_lost', 'timeout']);
const CANCEL_TIMEOUT_MS = 5_000;
/** Cancels still to confirm after a reconnect; the oldest is dropped beyond this (the sidecar's deadline ends it). */
const MAX_UNCONFIRMED_CANCELS = 16;

export type SettlementDeps = {
  context: PluginContext;
  connection: () => SidecarConnection;
  audit: DeviceAuditService;
  changes: MatterChangeBus;
  fabric: Pick<MatterFabricService, 'detect'>;
  reconciliation: Pick<MatterReconciliationService, 'request'>;
};

export class CommissioningSettlement {
  private releaseGate: (() => void) | null = null;
  /** Sidecar sessions the plugin ended whose cancel the sidecar has not confirmed yet. */
  private readonly unconfirmedCancels = new Set<string>();

  constructor(private readonly deps: SettlementDeps) {}

  private get storage() {
    return matterStorage(this.deps.context);
  }

  /** The release of the operation gate the running session holds. One session at a time. */
  holdGate(release: () => void): void {
    this.releaseGate = release;
  }

  /** Takes over what the sidecar says about the session. Terminal outcomes are handled once. */
  async apply(session: Session, sidecar: CommissioningSession): Promise<void> {
    if (!isActive(session) || session.settling) return;
    try {
      await this.take(session, sidecar);
    } catch (error) {
      await this.abandon(session, error);
    }
  }

  private async take(session: Session, sidecar: CommissioningSession): Promise<void> {
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
      // Another refresh may have settled the session while the audit was written: it must not come back to life.
      if (!isActive(session) || session.settling) return;
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

  /**
   * The session could not be handled to its end (a database or audit error). It ends as `internal` failure, its
   * sidecar session is cancelled and the gate is freed; a device that joined meanwhile surfaces as unclaimed.
   */
  async abandon(session: Session, error: unknown): Promise<void> {
    const reason = error instanceof Error ? redactSecrets(error.message) : 'unknown error';
    this.deps.context.logger.warn?.(`A Matter commissioning session could not be settled: ${reason}`);
    if (!isActive(session)) return;
    session.state = 'failed';
    session.failure = { code: 'internal' };
    this.finishSession(session);
    void this.cancelOnSidecar(session.sidecarSessionId);
    this.requestReconciliation();
    await this.record('matter.commissioning_failed', session, {
      failure: 'internal',
      ...(session.step ? { step: session.step } : {}),
    }).catch(() => undefined);
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
    const outcome = await this.write(session, nodeId);
    if ('code' in outcome) return this.fail(session, { code: outcome.code });
    const { registered, fabricId } = outcome;
    session.nodeRecordId = registered.node.id;
    session.endpoints = registered.endpoints.map((endpoint) => ({
      endpointId: endpoint.endpointId,
      id: endpoint.id,
      displayName: endpoint.displayName,
    }));
    session.state = 'succeeded';
    session.step = 'completed';
    this.finishSession(session);
    this.deps.changes.inventoryChanged();
    // Warning- and info-level findings did not stop the attempt; their types are kept with the outcome.
    const findings = session.attestation?.findings ?? [];
    await this.deps.audit.record(
      'matter.node_commissioned',
      session.principal,
      { type: 'matter.node', ref: registered.node.id },
      {
        nodeRef: registered.node.id,
        fabricId,
        nodeId: registered.node.nodeId,
        sessionRef: session.id,
        attestation: session.attestation?.status === 'overridden' ? 'overridden' : 'verified',
        ...(findings.length > 0 ? { findings: findings.join(',') } : {}),
      },
    );
  }

  /** Reads the node and writes its rows. A failure here means the device joined but the registry did not follow. */
  private async write(
    session: Session,
    nodeId: string,
  ): Promise<{ registered: RegisteredNode; fabricId: string } | { code: 'needs_reconciliation' | 'registry_failed' }> {
    const connection = this.deps.connection();
    try {
      const sidecarFabric = await connection.request('fabric.get');
      const view = await connection.request('inventory.get', { params: { nodeId } });
      // The own change is recorded now: the generation moved because of this session, not because of a restore.
      await this.deps.fabric.detect('event').catch(() => undefined);
      const recorded = await recordedFabricRow(this.storage.tables);
      const fabricId = sidecarFabric.fabricId;
      if (fabricId === null || (recorded && recorded.fabricId !== fabricId)) return { code: 'needs_reconciliation' };
      const now = new Date().toISOString();
      const registered = await this.storage.transaction((tables) =>
        registerCommissionedNode(tables, {
          fabricId,
          view,
          userId: session.userId,
          overridden: session.attestation?.status === 'overridden',
          now,
        }),
      );
      return { registered, fabricId };
    } catch (error) {
      return { code: error instanceof RegistryConflictError ? 'needs_reconciliation' : 'registry_failed' };
    }
  }

  async fail(session: Session, failure: SessionFailure, existingNodeId?: string): Promise<void> {
    session.state = 'failed';
    session.failure = failure;
    this.finishSession(session);
    if (RECONCILE_AFTER.has(failure.code)) this.requestReconciliation();
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

  /**
   * Ends the session as `interrupted`. Where the sidecar may still run it, it is cancelled there too (best effort, and
   * again after a reconnect), so "Start again" is not refused as busy. `force`: the caller already holds the session's
   * terminal handling (the sidecar itself reported the interruption).
   */
  async interrupt(session: Session, reason: InterruptReason, force = false): Promise<void> {
    if (!isActive(session) || (session.settling && !force)) return;
    session.settling = true;
    session.state = 'interrupted';
    session.failure = { code: 'interrupted' };
    this.finishSession(session);
    const cancelled = CANCEL_ON.has(reason) ? this.cancelOnSidecar(session.sidecarSessionId) : Promise.resolve();
    // The device's fail-safe rolls back a half-done attempt; one that completed on the sidecar shows up as unclaimed.
    if (reason !== 'plugin_restart') this.requestReconciliation();
    try {
      await this.record('matter.commissioning_interrupted', session, { reason });
    } finally {
      await cancelled;
    }
  }

  /** Asks the sidecar to cancel a session. Never throws; an unconfirmed cancel is sent again after a reconnect. */
  async cancelOnSidecar(sidecarSessionId: string, timeoutMs = CANCEL_TIMEOUT_MS): Promise<void> {
    try {
      await this.deps
        .connection()
        .request('commissioning.cancel', { params: { sessionId: sidecarSessionId }, timeoutMs });
      this.unconfirmedCancels.delete(sidecarSessionId);
    } catch (error) {
      if (error instanceof SidecarClientError && error.kind === 'request') {
        // The sidecar answered (`not_found` after its restart, for example): nothing left to cancel.
        this.unconfirmedCancels.delete(sidecarSessionId);
        return;
      }
      this.unconfirmedCancels.add(sidecarSessionId);
      if (this.unconfirmedCancels.size > MAX_UNCONFIRMED_CANCELS) {
        const [oldest] = this.unconfirmedCancels;
        this.unconfirmedCancels.delete(oldest);
      }
    }
  }

  /** Sends the cancels the sidecar could not confirm while it was unreachable. Never throws. */
  async flushCancels(): Promise<void> {
    for (const id of [...this.unconfirmedCancels]) await this.cancelOnSidecar(id);
  }

  requestReconciliation(): void {
    void this.deps.reconciliation.request().catch(() => undefined);
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

  record(
    action: string,
    session: Session | null,
    details: Record<string, string | number | boolean>,
    ref: string = session?.id ?? randomUUID(),
  ): Promise<void> {
    return this.deps.audit.record(
      action,
      session?.principal ?? null,
      { type: SUBJECT, ref },
      { sessionRef: ref, ...details },
    );
  }
}
