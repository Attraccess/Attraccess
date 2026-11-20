import { Injectable } from '@nestjs/common';
import {
  BillingTransaction,
  BillingTransactionItem,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import {
  BillingTransactionStatus,
  MeteringBillableUsage,
  MeteringBillItemDraft,
  MeteringCorrectionDraft,
  MeteringCorrectionRecord,
  MeteringDefinitionFlow,
  MeteringLifecycleAttempt,
  MeteringUsageRecord,
  NewResourceMeteringOperation,
  NewResourceMeteringSession,
  MeterAllocationKind,
  ResourceMeterRecord,
  ResourceMeteringOperationPatch,
  ResourceMeteringOperationRecord,
  ResourceMeteringSegmentPatch,
  ResourceMeteringSegmentRecord,
  ResourceMeteringSessionPatch,
  ResourceMeteringSessionRecord,
  ResourceMeteringSessionStatus,
} from '@attraccess/application-models';
import { In, LessThan, MoreThan, Not } from 'typeorm';
import {
  MeterNameTakenError,
  MeteringBillRef,
  MeteringStore,
  PendingSessionFilter,
  SegmentWindowUsage,
} from '../../../resources/metering/metering-store.port';
import { sessionLimitOf } from '../../../resources/usage/sessions/active-usage';
import type { TransactionContext } from '../../transaction-context';
import { isUniqueViolation } from '../../persistence-errors';
import { segmentsOfUsage, usageBoundarySince } from './metering-queries';
import { toAttempt, toMeter, toOperation, toSegment, toSession, toUsage } from './metering-mappers';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { findActiveUsages } from '../usage/active-usage-queries';
import { RESOURCE_LOCK, lockResource } from '../resources/resource-locks';

/** TypeORM implementation of the metering port. Every write joins the caller's transaction when it has one. */
@Injectable()
export class TypeOrmMeteringStore implements MeteringStore {
  constructor(private readonly managers: EntityManagerResolver) {}

  // ---- meters and their flow definition -----------------------------------------------------------

  async findDefinitionFlow(resourceId: number, context?: TransactionContext): Promise<MeteringDefinitionFlow> {
    const manager = this.managers.resolve(context);
    const nodes = await manager.find(ResourceFlowNode, { where: { resourceId } });
    const edges = await manager.find(ResourceFlowEdge, { where: { resourceId } });
    return {
      allNodes: nodes.map((node) => ({ id: node.id, type: node.type, data: node.data ?? null })),
      edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
    };
  }

  async listMeters(resourceId: number, context?: TransactionContext): Promise<ResourceMeterRecord[]> {
    const rows = await this.managers
      .resolve(context)
      .find(ResourceMeter, { where: { resourceId }, order: { id: 'ASC' } });
    return rows.map(toMeter);
  }

  async listAllMeters(context?: TransactionContext): Promise<ResourceMeterRecord[]> {
    return (await this.managers.resolve(context).find(ResourceMeter)).map(toMeter);
  }

  /** In a unit of work the meter row is locked (FOR NO KEY UPDATE): counter read-modify-writes queue instead of racing. */
  async findMeter(
    resourceId: number,
    meterId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeterRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeter, {
      where: { id: meterId, resourceId },
      ...(context ? { lock: { mode: 'for_no_key_update' as const } } : {}),
    });
    return row ? toMeter(row) : null;
  }

  async findMeterById(meterId: number, context?: TransactionContext): Promise<ResourceMeterRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeter, {
      where: { id: meterId },
      ...(context ? { lock: { mode: 'for_no_key_update' as const } } : {}),
    });
    return row ? toMeter(row) : null;
  }

  resourceExists(resourceId: number, context?: TransactionContext): Promise<boolean> {
    return this.managers.resolve(context).existsBy(Resource, { id: resourceId });
  }

  async createMeter(resourceId: number, name: string): Promise<ResourceMeterRecord> {
    const manager = this.managers.resolve();
    try {
      const saved = await manager.save(ResourceMeter, { resourceId, name });
      return toMeter(await manager.findOneByOrFail(ResourceMeter, { id: saved.id }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new MeterNameTakenError();
      throw error;
    }
  }

  async renameMeter(resourceId: number, meterId: number, name: string): Promise<void> {
    try {
      await this.managers.resolve().update(ResourceMeter, { id: meterId, resourceId }, { name });
    } catch (error) {
      if (isUniqueViolation(error)) throw new MeterNameTakenError();
      throw error;
    }
  }

  async setMeterRate(meterId: number, creditsPerUnit: number): Promise<void> {
    await this.managers.resolve().update(ResourceMeter, meterId, { creditsPerUnit });
  }

  async setMeterAllocation(meterId: number, allocation: MeterAllocationKind): Promise<void> {
    await this.managers.resolve().update(ResourceMeter, meterId, { allocation });
  }

  async recordMeterObservation(
    meterId: number,
    patch: { lifetimeValue?: string; counterValue?: string | null; latestObservedAt?: Date },
    context?: TransactionContext,
  ): Promise<void> {
    await this.managers.resolve(context).update(ResourceMeter, meterId, patch);
  }

  // ---- usages and lifecycle attempts --------------------------------------------------------------

  /** Takes the per-resource lifecycle lock of the usage store, so metering decisions queue with starts and stops. */
  async findSessionLimit(resourceId: number, context?: TransactionContext): Promise<number> {
    const manager = this.managers.resolve(context);
    if (context) await lockResource(manager, RESOURCE_LOCK.usageLifecycle, resourceId);
    const resource = await manager.findOne(Resource, {
      where: { id: resourceId },
      select: { id: true, type: true, maxParallelSessions: true },
    });
    return sessionLimitOf(resource);
  }

  async findRunningUsages(resourceId: number, context?: TransactionContext): Promise<MeteringUsageRecord[]> {
    return (await findActiveUsages(this.managers.resolve(context), resourceId)).map(toUsage);
  }

  async findUsage(usageId: number, context?: TransactionContext): Promise<MeteringUsageRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceUsage, { where: { id: usageId } });
    return row ? toUsage(row) : null;
  }

  async findUsages(usageIds: number[], context?: TransactionContext): Promise<MeteringUsageRecord[]> {
    if (!usageIds.length) return [];
    const rows = await this.managers.resolve(context).find(ResourceUsage, { where: { id: In(usageIds) } });
    return rows.map(toUsage);
  }

  async findBillableUsage(usageId: number, context?: TransactionContext): Promise<MeteringBillableUsage | null> {
    const row = await this.managers
      .resolve(context)
      .findOne(ResourceUsage, { where: { id: usageId }, relations: { user: true } });
    return row ? { ...toUsage(row), userBillingFactor: row.user.billingFactor } : null;
  }

  async findUsageOwner(usageId: number, context?: TransactionContext): Promise<number | null> {
    const row = await this.managers
      .resolve(context)
      .findOne(ResourceUsage, { where: { id: usageId }, select: { id: true, userId: true } });
    return row?.userId ?? null;
  }

  existsLifecycleAttempt(resourceId: number, context?: TransactionContext): Promise<boolean> {
    return this.managers.resolve(context).existsBy(ResourceUsageLifecycleAttempt, { resourceId });
  }

  async findLifecycleAttempt(
    attemptId: string,
    resourceId: number,
    context?: TransactionContext,
  ): Promise<MeteringLifecycleAttempt | null> {
    const row = await this.managers
      .resolve(context)
      .findOne(ResourceUsageLifecycleAttempt, { where: { id: attemptId, resourceId } });
    return row ? toAttempt(row) : null;
  }

  async findAnyLifecycleAttempt(
    resourceId: number,
    context?: TransactionContext,
  ): Promise<MeteringLifecycleAttempt | null> {
    const row = await this.managers.resolve(context).findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } });
    return row ? toAttempt(row) : null;
  }

  hasUsageBoundarySince(
    resourceId: number,
    meterId: number,
    requestedAt: Date,
    runningUsageIds: number[],
    context?: TransactionContext,
  ): Promise<boolean> {
    return usageBoundarySince(this.managers.resolve(context), resourceId, meterId, requestedAt, runningUsageIds);
  }

  // ---- metering sessions ------------------------------------------------------------------------

  /** In a unit of work the row is locked (FOR NO KEY UPDATE): settlements of one session queue, so a correction is once-only. */
  async findSession(sessionId: string, context?: TransactionContext): Promise<ResourceMeteringSessionRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeteringSession, {
      where: { id: sessionId },
      ...(context ? { lock: { mode: 'for_no_key_update' as const } } : {}),
    });
    return row ? toSession(row) : null;
  }

  async findSessionOfResource(
    resourceId: number,
    sessionId: string,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord | null> {
    const row = await this.managers
      .resolve(context)
      .findOne(ResourceMeteringSession, { where: { id: sessionId, resourceId } });
    return row ? toSession(row) : null;
  }

  async findRunningSessions(
    resourceId: number,
    usageIds: number[],
    meterIds: number[],
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]> {
    const rows = await this.managers.resolve(context).find(ResourceMeteringSession, {
      where: {
        resourceId,
        usageId: In(usageIds),
        meterId: In(meterIds),
        status: ResourceMeteringSessionStatus.Active,
      },
    });
    return rows.map(toSession);
  }

  async findRunningSession(
    resourceId: number,
    meterId: number,
    usageId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeteringSession, {
      where: { resourceId, meterId, usageId, status: ResourceMeteringSessionStatus.Active },
    });
    return row ? toSession(row) : null;
  }

  async findSharingSessions(
    resourceId: number,
    meterId: number,
    usageIds: number[],
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]> {
    const rows = await this.managers.resolve(context).find(ResourceMeteringSession, {
      where: {
        resourceId,
        meterId,
        usageId: In(usageIds),
        status: ResourceMeteringSessionStatus.Active,
        accounting: Not('per-session'),
      },
    });
    return rows.map(toSession);
  }

  async findRunningSessionsOfUsage(
    usageId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]> {
    const rows = await this.managers
      .resolve(context)
      .find(ResourceMeteringSession, { where: { usageId, status: ResourceMeteringSessionStatus.Active } });
    return rows.map(toSession);
  }

  async findSegmentedRunningSessionsOfUsage(
    usageId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]> {
    const rows = await this.managers.resolve(context).find(ResourceMeteringSession, {
      where: { usageId, status: ResourceMeteringSessionStatus.Active, accounting: 'segmented' },
    });
    return rows.map(toSession);
  }

  async findSegmentedPendingSessions(
    usageId: number,
    meterId: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]> {
    const rows = await this.managers.resolve(context).find(ResourceMeteringSession, {
      where: { usageId, meterId, accounting: 'segmented', status: ResourceMeteringSessionStatus.Pending },
    });
    return rows.map(toSession);
  }

  async findSessionsOfUsage(usageId: number, context?: TransactionContext): Promise<ResourceMeteringSessionRecord[]> {
    return (await this.managers.resolve(context).find(ResourceMeteringSession, { where: { usageId } })).map(toSession);
  }

  async findUnsettledSessions(
    resourceId: number,
    limit: number,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord[]> {
    const rows = await this.managers.resolve(context).find(ResourceMeteringSession, {
      where: { resourceId, status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map(toSession);
  }

  async findPendingSessionIds(
    meterId: number,
    filter: PendingSessionFilter,
    context?: TransactionContext,
  ): Promise<string[]> {
    const excluded = filter.excludeAccounting;
    const rows = await this.managers.resolve(context).find(ResourceMeteringSession, {
      where: {
        meterId,
        status: ResourceMeteringSessionStatus.Pending,
        accounting: excluded.length === 1 ? Not(excluded[0]) : Not(In(excluded)),
        ...(filter.resourceId === undefined ? {} : { resourceId: filter.resourceId }),
        ...(filter.usageIdBelow === undefined ? {} : { usageId: LessThan(filter.usageIdBelow) }),
      },
      select: { id: true },
    });
    return rows.map(({ id }) => id);
  }

  hasLaterSession(
    resourceId: number,
    meterId: number,
    usageId: number,
    context?: TransactionContext,
  ): Promise<boolean> {
    return this.managers
      .resolve(context)
      .exists(ResourceMeteringSession, { where: { resourceId, meterId, usageId: MoreThan(usageId) } });
  }

  async createSession(
    values: NewResourceMeteringSession,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord> {
    const manager = this.managers.resolve(context);
    await manager.save(ResourceMeteringSession, { ...values });
    return toSession(await manager.findOneByOrFail(ResourceMeteringSession, { id: values.id }));
  }

  async updateSession(
    sessionId: string,
    patch: ResourceMeteringSessionPatch,
    context?: TransactionContext,
  ): Promise<void> {
    await this.managers.resolve(context).update(ResourceMeteringSession, sessionId, patch);
  }

  async deleteSession(sessionId: string, context?: TransactionContext): Promise<void> {
    await this.managers.resolve(context).delete(ResourceMeteringSession, sessionId);
  }

  async deleteSessionsOfUsage(usageId: number, context?: TransactionContext): Promise<void> {
    await this.managers.resolve(context).delete(ResourceMeteringSession, { usageId });
  }

  async markOwnSessionsCompromised(
    usageId: number,
    meterIds: number[],
    reason: string,
    context?: TransactionContext,
  ): Promise<void> {
    await this.managers
      .resolve(context)
      .update(
        ResourceMeteringSession,
        { usageId, meterId: In(meterIds), accounting: 'own' },
        { compromisedReason: reason },
      );
  }

  async markSessionsSegmented(sessionIds: string[], context?: TransactionContext): Promise<void> {
    await this.managers
      .resolve(context)
      .update(ResourceMeteringSession, { id: In(sessionIds), accounting: 'own' }, { accounting: 'segmented' });
  }

  async failSessions(sessionIds: string[], reason: string, context?: TransactionContext): Promise<void> {
    if (!sessionIds.length) return;
    const manager = this.managers.resolve(context);
    await manager.update(
      ResourceMeteringSession,
      { id: In(sessionIds) },
      { status: ResourceMeteringSessionStatus.Failed, failureReason: reason },
    );
    await this.clearPendingShareMarkers(sessionIds, context);
  }

  async waiveSession(
    resourceId: number,
    sessionId: string,
    at: Date,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSessionRecord | null> {
    const manager = this.managers.resolve(context);
    const result = await manager.update(
      ResourceMeteringSession,
      {
        id: sessionId,
        resourceId,
        status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
      },
      { status: ResourceMeteringSessionStatus.Waived, settledAt: at },
    );
    if (!result.affected) return null;
    await this.clearPendingShareMarkers([sessionId], context);
    return toSession(await manager.findOneByOrFail(ResourceMeteringSession, { id: sessionId }));
  }

  /**
   * A pending share that will never be charged (the session failed or was waived) no longer says it is charged
   * later: its line reads like any meter line without a final reading. Only display data of the item changes.
   */
  private async clearPendingShareMarkers(sessionIds: string[], context?: TransactionContext): Promise<void> {
    if (!sessionIds.length) return;
    await this.managers
      .resolve(context)
      .update(
        BillingTransactionItem,
        { externalReference: In(sessionIds.map((id) => `metering:${id}:unavailable`)) },
        { allocation: null },
      );
  }

  // ---- operation ledger -------------------------------------------------------------------------

  async findOperation(
    operationId: string,
    context?: TransactionContext,
  ): Promise<ResourceMeteringOperationRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeteringOperation, { where: { id: operationId } });
    return row ? toOperation(row) : null;
  }

  async findCompletedFinalOperation(
    operationId: string,
    sessionId: string,
    context?: TransactionContext,
  ): Promise<ResourceMeteringOperationRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeteringOperation, {
      where: { id: operationId, sessionId, kind: 'final', status: 'completed' },
    });
    return row ? toOperation(row) : null;
  }

  async createOperation(
    values: NewResourceMeteringOperation,
    context?: TransactionContext,
  ): Promise<ResourceMeteringOperationRecord> {
    const manager = this.managers.resolve(context);
    await manager.save(ResourceMeteringOperation, { ...values });
    return toOperation(await manager.findOneByOrFail(ResourceMeteringOperation, { id: values.id }));
  }

  async updateOperation(
    operationId: string,
    patch: ResourceMeteringOperationPatch,
    context?: TransactionContext,
  ): Promise<void> {
    await this.managers.resolve(context).update(ResourceMeteringOperation, operationId, patch);
  }

  async closePendingOperation(
    operationId: string,
    status: 'failed' | 'expired',
    error: string,
    at: Date,
  ): Promise<void> {
    await this.managers
      .resolve()
      .update(ResourceMeteringOperation, { id: operationId, status: 'pending' }, { status, error, completedAt: at });
  }

  async expirePendingOperations(error: string): Promise<void> {
    await this.managers
      .resolve()
      .update(ResourceMeteringOperation, { status: 'pending' }, { status: 'expired', error });
  }

  // ---- shared segments --------------------------------------------------------------------------

  async findSegment(segmentId: string, context?: TransactionContext): Promise<ResourceMeteringSegmentRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeteringSegment, { where: { id: segmentId } });
    return row ? toSegment(row) : null;
  }

  /** In a unit of work the open segment is locked (FOR NO KEY UPDATE): boundaries of one meter queue behind each other. */
  async findOpenSegment(meterId: number, context?: TransactionContext): Promise<ResourceMeteringSegmentRecord | null> {
    const row = await this.managers.resolve(context).findOne(ResourceMeteringSegment, {
      where: { meterId, status: 'open' },
      order: { startedAt: 'DESC' },
      ...(context ? { lock: { mode: 'for_no_key_update' as const } } : {}),
    });
    return row ? toSegment(row) : null;
  }

  async findOpenSegments(resourceId?: number, context?: TransactionContext): Promise<ResourceMeteringSegmentRecord[]> {
    const rows = await this.managers.resolve(context).find(ResourceMeteringSegment, {
      where: resourceId === undefined ? { status: 'open' } : { status: 'open', resourceId },
    });
    return rows.map(toSegment);
  }

  async findUsageSegments(
    meterId: number,
    usage: SegmentWindowUsage,
    context?: TransactionContext,
  ): Promise<ResourceMeteringSegmentRecord[]> {
    return (await segmentsOfUsage(this.managers.resolve(context), meterId, usage)).map(toSegment);
  }

  async createSegment(segment: ResourceMeteringSegmentRecord, context?: TransactionContext): Promise<void> {
    await this.managers.resolve(context).save(ResourceMeteringSegment, { ...segment });
  }

  async updateSegment(
    segmentId: string,
    patch: ResourceMeteringSegmentPatch,
    context?: TransactionContext,
  ): Promise<void> {
    await this.managers.resolve(context).update(ResourceMeteringSegment, segmentId, patch);
  }

  async abandonOpenSegments(meterId: number, at: Date, context?: TransactionContext): Promise<void> {
    await this.managers
      .resolve(context)
      .update(ResourceMeteringSegment, { meterId, status: 'open' }, { status: 'abandoned', endedAt: at });
  }

  // ---- bill lines -------------------------------------------------------------------------------

  async requireBillOfUsage(
    usageId: number,
    completedOnly: boolean,
    context?: TransactionContext,
  ): Promise<MeteringBillRef> {
    const bill = await this.managers.resolve(context).findOneOrFail(BillingTransaction, {
      where: completedOnly
        ? { resourceUsageId: usageId, status: BillingTransactionStatus.Completed }
        : { resourceUsageId: usageId },
    });
    return { id: bill.id, userId: bill.userId };
  }

  hasBillItem(billId: number, externalReference: string, context?: TransactionContext): Promise<boolean> {
    return this.managers
      .resolve(context)
      .exists(BillingTransactionItem, { where: { billingTransactionId: billId, externalReference } });
  }

  async addBillItem(billId: number, item: MeteringBillItemDraft, context?: TransactionContext): Promise<void> {
    await this.managers.resolve(context).save(BillingTransactionItem, { billingTransactionId: billId, ...item });
  }

  async createCorrection(
    draft: MeteringCorrectionDraft,
    context?: TransactionContext,
  ): Promise<MeteringCorrectionRecord> {
    const saved = await this.managers.resolve(context).save(BillingTransaction, {
      userId: draft.userId,
      initiatorId: draft.initiatorId,
      correctionOfId: draft.correctionOfId,
      amount: draft.amount,
      status: BillingTransactionStatus.Completed,
    });
    return { id: saved.id, userId: saved.userId, amount: saved.amount, status: saved.status };
  }
}
