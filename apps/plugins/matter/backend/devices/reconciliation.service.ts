import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { SidecarClientError } from '../client/errors';
import type { SidecarConnection } from '../client/connection';
import { MatterConnectionService } from '../connection/connection.service';
import { MatterFabricGuard } from '../fabric/guard';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { DeviceAuditService, type AuditActor, type DeviceAuditSubject } from './audit.service';
import { pruneCommands } from './commands';
import {
  MatterFabric,
  MatterNode,
  MatterReconciliationStatus,
  RECONCILIATION_ROW_ID,
  type DetachedReason,
  type ReconciliationResult,
} from './entities';
import type { NodeListView } from './sidecar-types';
import {
  findLive,
  identityOf,
  newCounters,
  newObservations,
  reattachedState,
  syncNode,
  totalChanges,
  type Counters,
  type Observations,
} from './sync';

export type ReconciliationSummary = {
  /** Why nothing was applied, for the skipped and failed results. */
  reason?: string;
  changes: Counters;
  changeCount: number;
  observed: Observations;
  nodesListed: number;
};

export type ReconciliationStatusView = {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastResult: ReconciliationResult | null;
  lastSummary: ReconciliationSummary | null;
  sidecarFabricId: string | null;
};

type PendingAudit = { action: string; subject: DeviceAuditSubject; details: Record<string, string | number | boolean> };

/** The part of the connection reconciliation needs; `SidecarConnection` satisfies it. */
export type InventorySource = Pick<SidecarConnection, 'request' | 'status'>;

const SKIPPED_CODES = new Set([
  'unsupported_capability',
  'sidecar_unavailable',
  'incompatible_release',
  'unauthorized',
]);

/**
 * Reconciles the plugin's node records with the sidecar. The sidecar is authoritative for fabric membership; this
 * service never writes to it and never touches editable metadata. It changes anything only on an authoritative
 * inventory, so a degraded or partial answer cannot detach the fleet. Runs are idempotent and single-flight.
 */
@Injectable()
export class MatterReconciliationService {
  private current: Promise<ReconciliationStatusView> | undefined;
  private queued: Promise<ReconciliationStatusView> | undefined;
  /** The administrator of the newest manual trigger that joined the queued run; null when only automatic ones did. */
  private queuedPrincipal: PluginAuditPrincipal | null = null;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
  ) {}

  private get source(): InventorySource {
    return this.connectionService.connection;
  }

  async status(): Promise<ReconciliationStatusView> {
    const row = await this.context.getRepository(MatterReconciliationStatus).findOneBy({ id: RECONCILIATION_ROW_ID });
    return viewOf(row);
  }

  /**
   * Starts a run. A trigger that arrives during a run does not start a second one in parallel: all of them coalesce
   * into one follow-up run that starts when the current one ends.
   */
  request(principal: PluginAuditPrincipal | null = null): Promise<ReconciliationStatusView> {
    if (!this.current) {
      this.current = this.execute(principal).finally(() => {
        this.current = undefined;
      });
      return this.current;
    }
    if (principal) this.queuedPrincipal = principal;
    this.queued ??= this.current
      .catch(() => undefined)
      .then(() => {
        const queuedPrincipal = this.queuedPrincipal;
        this.queued = undefined;
        this.queuedPrincipal = null;
        return this.request(queuedPrincipal);
      });
    return this.queued;
  }

  private async execute(principal: PluginAuditPrincipal | null): Promise<ReconciliationStatusView> {
    const startedAt = new Date().toISOString();
    let result: ReconciliationResult;
    let summary: ReconciliationSummary = emptySummary();
    let fabricId: string | null = null;
    const audits: PendingAudit[] = [];
    try {
      const outcome = await this.run(audits);
      result = outcome.result;
      summary = outcome.summary;
      fabricId = outcome.fabricId;
    } catch (error) {
      result = 'failed';
      summary = { ...emptySummary(), reason: error instanceof Error ? error.name : 'error' };
      this.context.logger.warn?.('Matter reconciliation failed.');
      audits.length = 0;
    }
    await this.context.runSerialized(async (manager) => {
      const repo = manager.getRepository(MatterReconciliationStatus);
      const previous = await repo.findOneBy({ id: RECONCILIATION_ROW_ID });
      await repo.save({
        id: RECONCILIATION_ROW_ID,
        lastStartedAt: startedAt,
        lastFinishedAt: new Date().toISOString(),
        lastResult: result,
        lastSummary: JSON.stringify(summary),
        // A skipped run did not learn the fabric: keep what the last applied run saw.
        sidecarFabricId: result === 'applied' ? fabricId : (previous?.sidecarFabricId ?? null),
      });
    });
    // After the commit and never inside it: the audit store is a separate database.
    const actor: AuditActor | null = audits.length > 0 ? await this.audit.actorFor(principal) : null;
    if (actor) {
      const initiator = actor.system ? 'system' : 'administrator';
      for (const entry of audits) {
        await this.audit.record(entry.action, actor, entry.subject, { ...entry.details, initiator });
      }
    }
    return this.status();
  }

  private async run(
    audits: PendingAudit[],
  ): Promise<{ result: ReconciliationResult; summary: ReconciliationSummary; fabricId: string | null }> {
    const skipped = (reason: string, result: ReconciliationResult = 'skipped_unavailable') => ({
      result,
      summary: { ...emptySummary(), reason },
      fabricId: null,
    });
    const status = this.source.status();
    if (status.state !== 'connected') return skipped(status.reason ?? status.state);
    if (this.guard.restoring) return skipped('restore_in_progress');
    const epoch = this.guard.epoch;
    const inventory = status.capabilities?.capabilities.find((entry) => entry.family === 'inventory');
    if (inventory && !inventory.available) return skipped('unsupported_capability');

    let list: NodeListView;
    try {
      list = await this.source.request('inventory.list');
    } catch (error) {
      if (error instanceof SidecarClientError) {
        if (SKIPPED_CODES.has(error.code) || error.kind === 'unavailable') return skipped(error.code);
        return { ...skipped(error.code, 'failed') };
      }
      throw error;
    }
    if (!list.authoritative) return skipped('not_authoritative', 'skipped_non_authoritative');

    const summary = emptySummary();
    summary.nodesListed = list.nodes.length;
    const applied = await this.context.runSerialized(async (manager) => {
      // A restore ran (or is running) since the inventory was read: it replaced the tables this list was meant for.
      if (this.guard.restoring || this.guard.epoch !== epoch) return false;
      const now = new Date();
      await this.apply(manager, list, summary, audits, now.toISOString());
      await pruneCommands(manager, now);
      return true;
    });
    if (!applied) return skipped('restore_in_progress');
    summary.changeCount = totalChanges(summary.changes);
    return { result: 'applied', summary, fabricId: list.fabricId };
  }

  private async apply(
    manager: EntityManager,
    list: NodeListView,
    summary: ReconciliationSummary,
    audits: PendingAudit[],
    now: string,
  ): Promise<void> {
    const { changes: counters, observed } = summary;
    const fabrics = manager.getRepository(MatterFabric);
    const nodes = manager.getRepository(MatterNode);
    const activeFabrics = await fabrics
      .createQueryBuilder('f')
      .where(`f.status = 'active' AND f.retiredAt IS NULL`)
      .getMany();

    const fabricIdOf = new Map<string, string>();
    const detach = async (node: MatterNode, reason: DetachedReason) => {
      node.lifecycleState = 'detached';
      node.detachedReason = reason;
      node.detachedAt = now;
      node.updatedAt = now;
      await nodes.update(
        { id: node.id },
        { lifecycleState: 'detached', detachedReason: reason, detachedAt: now, updatedAt: now },
      );
      counters.nodesDetached += 1;
      audits.push({
        action: 'matter.node_detached',
        subject: { type: 'matter.node', ref: node.id },
        details: { nodeRef: node.id, fabricId: fabricIdOf.get(node.fabricRef) ?? '0', nodeId: node.nodeId, reason },
      });
    };
    const liveOf = async (fabricRef: string) => findLive(manager, MatterNode, 'fabricRef', fabricRef);
    const detachableIn = async (fabricRef: string) =>
      (await liveOf(fabricRef)).filter((n) => n.lifecycleState === 'claimed' || n.lifecycleState === 'unclaimed');

    for (const fabric of await fabrics.find()) fabricIdOf.set(fabric.id, fabric.fabricId);

    // The sidecar has no fabric: everything it once listed is gone from its point of view.
    if (list.fabricId === null) {
      for (const fabric of activeFabrics) {
        fabric.status = 'absent';
        await fabrics.update({ id: fabric.id }, { status: 'absent' });
        counters.fabricsChanged += 1;
        for (const node of await detachableIn(fabric.id)) await detach(node, 'fabric_absent');
      }
      return;
    }

    let fabric = await fabrics
      .createQueryBuilder('f')
      .where('f.fabricId = :id AND f.retiredAt IS NULL', { id: list.fabricId })
      .getOne();
    if (!fabric) {
      fabric = fabrics.create({
        id: randomUUID(),
        fabricId: list.fabricId,
        label: null,
        firstSeenAt: now,
        lastSeenAt: now,
        status: 'active',
        retiredAt: null,
      });
      await fabrics.insert(fabric);
      fabricIdOf.set(fabric.id, fabric.fabricId);
      counters.fabricsChanged += 1;
    } else if (fabric.status !== 'active') {
      fabric.status = 'active';
      fabric.lastSeenAt = now;
      await fabrics.update({ id: fabric.id }, { status: 'active', lastSeenAt: now });
      counters.fabricsChanged += 1;
    }

    // A different fabric was active before: the database was restored from another time or the sidecar storage was
    // replaced. The old fabric's nodes are detached and never matched to the new fabric's nodes automatically.
    const mismatches: { fabric: MatterFabric; detached: number }[] = [];
    for (const other of activeFabrics.filter((candidate) => candidate.id !== fabric.id)) {
      other.status = 'absent';
      await fabrics.update({ id: other.id }, { status: 'absent' });
      counters.fabricsChanged += 1;
      const stale = await detachableIn(other.id);
      for (const node of stale) await detach(node, 'fabric_mismatch');
      mismatches.push({ fabric: other, detached: stale.length });
    }
    // A wiped sidecar first comes up without a fabric (nodes detached with `fabric_absent`) and only then with a new
    // one. That is the same restore mismatch: those nodes must not come back by themselves if their fabric returns.
    const absentSince = await nodes
      .createQueryBuilder('n')
      .where(`n.fabricRef != :fabric AND n.removedAt IS NULL`, { fabric: fabric.id })
      .andWhere(`n.lifecycleState = 'detached' AND n.detachedReason = 'fabric_absent'`)
      .getMany();
    const byFabric = new Map<string, MatterNode[]>();
    for (const node of absentSince) byFabric.set(node.fabricRef, [...(byFabric.get(node.fabricRef) ?? []), node]);
    for (const [fabricRef, stranded] of byFabric) {
      for (const node of stranded) await detach(node, 'fabric_mismatch');
      const other = await fabrics.findOneBy({ id: fabricRef });
      if (other) mismatches.push({ fabric: other, detached: stranded.length });
    }

    const live = await liveOf(fabric.id);
    const byNodeId = new Map(live.map((node) => [node.nodeId, node]));
    const listed = new Set<string>();
    let quarantined = 0;

    for (const view of list.nodes) {
      if (listed.has(view.nodeId)) continue;
      listed.add(view.nodeId);
      const node = byNodeId.get(view.nodeId);
      if (!node) {
        const created: MatterNode = nodes.create({
          id: randomUUID(),
          fabricRef: fabric.id,
          nodeId: view.nodeId,
          displayName: null,
          description: null,
          location: null,
          lifecycleState: 'unclaimed',
          detachedReason: null,
          firstSeenAt: now,
          claimedAt: null,
          claimedBy: null,
          detachedAt: null,
          archivedAt: null,
          archivedBy: null,
          removedAt: null,
          removedBy: null,
          removalReason: null,
          mergedInto: null,
          createdAt: now,
          updatedAt: now,
          ...identityOf(view, now),
        });
        await nodes.insert(created);
        await syncNode(manager, created, view, now, counters);
        counters.nodesQuarantined += 1;
        quarantined += 1;
        audits.push({
          action: 'matter.node_quarantined',
          subject: { type: 'matter.node', ref: created.id },
          details: { nodeRef: created.id, fabricId: fabric.fabricId, nodeId: created.nodeId },
        });
        continue;
      }
      if (node.lifecycleState === 'archived') {
        observed.archivedReappeared += 1;
        continue;
      }
      if (node.lifecycleState === 'detached') {
        if (node.detachedReason === 'fabric_mismatch') {
          observed.mismatchedStillListed += 1;
          continue;
        }
        // Exact identity again (same fabric, same node ID): a re-attachment, never a silent add.
        const resultingState = reattachedState(node);
        node.lifecycleState = resultingState;
        node.detachedReason = null;
        node.detachedAt = null;
        node.updatedAt = now;
        await nodes.update(
          { id: node.id },
          { lifecycleState: resultingState, detachedReason: null, detachedAt: null, updatedAt: now },
        );
        counters.nodesReattached += 1;
        audits.push({
          action: 'matter.node_reattached',
          subject: { type: 'matter.node', ref: node.id },
          details: { nodeRef: node.id, fabricId: fabric.fabricId, nodeId: node.nodeId, resultingState },
        });
      }
      await syncNode(manager, node, view, now, counters);
    }

    for (const node of live) {
      if (listed.has(node.nodeId)) continue;
      if (node.lifecycleState === 'claimed' || node.lifecycleState === 'unclaimed')
        await detach(node, 'absent_from_sidecar');
    }

    for (const mismatch of mismatches) {
      audits.push({
        action: 'matter.fabric_mismatch_detected',
        subject: { type: 'matter.fabric', ref: mismatch.fabric.id },
        details: {
          fabricRef: mismatch.fabric.id,
          previousFabricId: mismatch.fabric.fabricId,
          detachedNodes: mismatch.detached,
          quarantinedNodes: quarantined,
        },
      });
    }
  }
}

function emptySummary(): ReconciliationSummary {
  return { changes: newCounters(), changeCount: 0, observed: newObservations(), nodesListed: 0 };
}

function viewOf(row: MatterReconciliationStatus | null): ReconciliationStatusView {
  return {
    lastStartedAt: row?.lastStartedAt ?? null,
    lastFinishedAt: row?.lastFinishedAt ?? null,
    lastResult: row?.lastResult ?? null,
    lastSummary: row?.lastSummary ? (JSON.parse(row.lastSummary) as ReconciliationSummary) : null,
    sidecarFabricId: row?.sidecarFabricId ?? null,
  };
}
