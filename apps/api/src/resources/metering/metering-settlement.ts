import { Logger, ConflictException } from '@nestjs/common';

import {
  BillingAllocationRecord,
  ResourceMeteringOperationRecord,
  ResourceMeteringSessionRecord,
  ResourceMeteringSessionStatus,
} from '@attraccess/application-models';

import { billingTransactionAuditEvent } from '../../audit/policies/billing';
import type { AuditRecorder } from '../../audit/recorder/audit-event';
import type { TransactionContext } from '../../database/transaction-context';
import { TransactionScope, UnitOfWork } from '../../database/unit-of-work';
import { LiveNotificationsService } from '../../billing/live-notifications/live-notifications.service';

import type { MeteringStore } from './metering-store.port';
import { partMeterCharge, partMeterDiscount, priorConsumptionOf } from './continued-meter-charge';
import { meterCharge, formatMeterValue } from './quantity';
import { sessionShare } from './segment-charges';

const REINITIALIZED = 'The meter was re-initialized for a later session before the final reading was collected';

/** Why a reading missed at a project switch stays missing: the measurement goes on with the continuation. */
const unreadAtProjectSwitch = (reason: string) =>
  `The meter could not be read at the project switch (${reason}); consumption since its last reading is counted after the switch`;

/** Why a session without its final reading is left pending or failed; `superseded` when a later session uses the meter. */
function unreadReason(session: ResourceMeteringSessionRecord, final: MeterFinal, superseded: boolean): string {
  // At a project switch the later session is the continuation: nothing was initialized again.
  const switched = final.status === 'unavailable' && final.atProjectSwitch;
  if (superseded && !switched) return REINITIALIZED;
  if (session.compromisedReason) return session.compromisedReason;
  if (final.status !== 'unavailable') return 'No final reading was collected';
  return superseded ? unreadAtProjectSwitch(final.reason) : final.reason;
}

export type MeterFinal =
  { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string; atProjectSwitch?: boolean };

export type FinalCollection = { status: 'not-metered' } | { status: 'collected'; meters: Record<string, MeterFinal> };

export class MeteringSettlement {
  public constructor(
    protected readonly store: MeteringStore,
    protected readonly unitOfWork: UnitOfWork,
    protected readonly audit: AuditRecorder,
    protected readonly liveNotifications: LiveNotificationsService,
    protected readonly logger: Logger,
  ) {}

  async waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSessionRecord> {
    const session = await this.store.waiveSession(resourceId, sessionId, new Date());
    if (!session) throw new ConflictException('METER_SESSION_NOT_PENDING');
    void this.audit.record({
      domain: 'resource',
      action: 'meter_charge.waived',
      actor: { id: initiatorId, authenticationMethod: 'session' },
      subject: { type: 'resource', id: resourceId },
      details: {
        usageId: session.usageId,
        meterId: session.meterId,
        ...(session.latestValue === null
          ? {}
          : { waivedCredits: meterCharge(BigInt(session.latestValue), session.creditsPerUnit) }),
      },
    });
    return session;
  }

  /** A re-initialized meter makes older pending charges unrecoverable. Measuring points of their own are not affected. */
  async failOlderPending(meterId: number): Promise<void> {
    const ids = await this.store.findPendingSessionIds(meterId, { excludeAccounting: ['per-session'] });
    if (!ids.length) return;
    await this.store.failSessions(ids, 'The meter was re-initialized for a later session');
  }

  /** Tells whoever watches the bill about a correction once it committed; a failure only gets logged. */
  private announceCorrection(scope: TransactionScope, correctionId: number): void {
    scope.afterCommit(() => {
      this.liveNotifications
        .notifyTransactionUpdate(correctionId)
        .catch((error) => this.logger.warn(`Failed to publish meter correction ${correctionId}`, error));
    });
  }

  private async requireSession(sessionId: string, context: TransactionContext) {
    const session = await this.store.findSession(sessionId, context);
    if (!session) throw new Error(`The metering session ${sessionId} does not exist`);
    return session;
  }

  private async requireBillableUsage(usageId: number, context: TransactionContext) {
    const usage = await this.store.findBillableUsage(usageId, context);
    if (!usage) throw new Error(`The usage ${usageId} does not exist`);
    return usage;
  }

  /**
   * The usage's bill is completed and immutable: the meter consumption goes onto a new correction transaction.
   *
   * In a switched session (ATT-1421) this is the last part: a switch is refused while a billed meter of the part
   * cannot be read, and settles the part with its reading. The correction is rounded with the earlier parts, which are
   * all settled by then, so the session still costs what an unsplit one does. Should an earlier part ever be settled
   * late, after a later part was billed, the later part did not count its consumption: each consumption is still
   * billed once, by the part it belongs to, and the session can only differ from an unsplit one by rounding.
   */
  async settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void> {
    await this.unitOfWork.run(async (scope) => {
      const session = await this.requireSession(sessionId, scope);
      if (session.status !== ResourceMeteringSessionStatus.Pending) return;
      const operation = await this.store.findOperation(operationId, scope);
      if (!operation) throw new Error(`The metering operation ${operationId} does not exist`);
      const usage = await this.requireBillableUsage(session.usageId, scope);
      if (session.creditsPerUnit === 0) {
        await this.store.updateSession(
          session.id,
          {
            status: ResourceMeteringSessionStatus.Settled,
            consumedValue: operation.totalValue,
            chargeCredits: 0,
            finalOperationId: operation.id,
            failureReason: null,
            settledAt: new Date(),
          },
          scope,
        );
        return;
      }
      const original = await this.store.requireBillOfUsage(usage.id, true, scope);
      // The last part of a switched session is rounded with the earlier ones, which were settled at their switch.
      const prior = await priorConsumptionOf(this.store, session, scope);
      const charge = partMeterCharge(prior, BigInt(operation.totalValue as string), session.creditsPerUnit);
      const factor = usage.billingFactor ?? usage.userBillingFactor;
      const discount = partMeterDiscount(prior, charge, session.creditsPerUnit, factor);
      const correction = await this.store.createCorrection(
        { userId: original.userId, initiatorId, correctionOfId: original.id, amount: -(charge - discount) },
        scope,
      );
      await this.addMeterItem(scope, correction.id, session, operation, prior);
      if (discount !== 0) {
        await this.store.addBillItem(
          correction.id,
          {
            name: 'BILLING_FACTOR',
            description: `${factor}%`,
            externalReference: `metering:${session.id}:${operation.id}:discount`,
            unitPrice: -discount,
            quantity: 1,
          },
          scope,
        );
      }
      await this.store.updateSession(
        session.id,
        {
          status: ResourceMeteringSessionStatus.Settled,
          consumedValue: operation.totalValue,
          chargeCredits: charge,
          finalOperationId: operation.id,
          failureReason: null,
          settledAt: new Date(),
        },
        scope,
      );
      await this.audit.record(
        billingTransactionAuditEvent({
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'meter-correction',
        }),
        scope,
      );
      this.announceCorrection(scope, correction.id);
    });
  }

  private async hasSegments(context: TransactionContext, session: ResourceMeteringSessionRecord): Promise<boolean> {
    const usage = await this.store.findUsage(session.usageId, context);
    if (!usage) throw new Error(`The usage ${session.usageId} does not exist`);
    return (await this.store.findUsageSegments(session.meterId, usage, context)).length > 0;
  }

  /**
   * The item a session's shares of its shared segments become. Null while a segment it took part in is still open;
   * `abandoned` when the meter was re-initialized before such a segment got its closing reading, so the share can
   * never be known (it is not billed partially).
   */
  protected async segmentedItem(context: TransactionContext, session: ResourceMeteringSessionRecord) {
    const usage = await this.store.findUsage(session.usageId, context);
    if (!usage) throw new Error(`The usage ${session.usageId} does not exist`);
    const segments = await this.store.findUsageSegments(session.meterId, usage, context);
    if (segments.some((segment) => segment.status === 'abandoned')) return 'abandoned' as const;
    if (!segments.length || segments.some((segment) => segment.status !== 'closed')) return null;
    const prior = await priorConsumptionOf(this.store, session, context);
    const share = sessionShare(segments, usage.id, prior);
    return {
      share,
      // Only a solo share is rounded with the earlier parts; its discount is rounded with them too.
      priorConsumption: share.solo ? prior : BigInt(0),
      item: {
        name: session.meterName,
        description: null,
        externalReference: `metering:${session.id}:segments`,
        unitPrice: share.credits,
        quantity: 1,
        meterQuantity: formatMeterValue(share.quantity),
        meterCreditsPerUnit: session.creditsPerUnit,
        allocation: share.solo
          ? null
          : ({ kind: 'meter', segments: share.breakdown } satisfies BillingAllocationRecord),
      },
    };
  }

  /**
   * A session that shared the meter is billed its shares once every segment it took part in is closed. A segment
   * whose closing reading failed keeps the meter line pending until a later reading closes it.
   */
  protected async settleSegmentedSession(
    context: TransactionContext,
    session: ResourceMeteringSessionRecord,
    final: MeterFinal,
  ): Promise<void> {
    const billed = await this.segmentedItem(context, session);
    if (billed === 'abandoned') {
      await this.addUnavailableItem(
        context,
        session.usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      await this.store.updateSession(
        session.id,
        { status: ResourceMeteringSessionStatus.Failed, failureReason: REINITIALIZED },
        context,
      );
      return;
    }
    // A part before a project switch that has no segment: the continuation took its place in the one still open, and
    // no earlier reading ever measured it. Nothing is left that a later reading could bill to it.
    if (
      !billed &&
      final.status === 'unavailable' &&
      final.atProjectSwitch &&
      !(await this.hasSegments(context, session))
    ) {
      await this.addUnavailableItem(
        context,
        session.usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      await this.store.updateSession(
        session.id,
        { status: ResourceMeteringSessionStatus.Failed, failureReason: unreadAtProjectSwitch(final.reason) },
        context,
      );
      return;
    }
    if (!billed) {
      await this.addUnavailableItem(
        context,
        session.usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
        { kind: 'meter', segments: [], pending: true },
      );
      await this.store.updateSession(
        session.id,
        {
          status: ResourceMeteringSessionStatus.Pending,
          failureReason:
            final.status === 'unavailable'
              ? final.reason
              : 'The meter could not be read when the session ended; its share is billed once a later reading succeeds',
        },
        context,
      );
      return;
    }
    const transaction = await this.store.requireBillOfUsage(session.usageId, false, context);
    if (!(await this.store.hasBillItem(transaction.id, billed.item.externalReference, context)))
      await this.store.addBillItem(transaction.id, billed.item, context);
    await this.store.updateSession(
      session.id,
      {
        status: ResourceMeteringSessionStatus.Settled,
        consumedValue: billed.share.quantity.toString(),
        chargeCredits: billed.share.credits,
        failureReason: null,
        settledAt: new Date(),
      },
      context,
    );
  }

  /** A closed segment makes its share known to sessions that already ended: they are billed as a correction. */
  async settleClosedSegment(segmentId: string): Promise<void> {
    const segment = await this.store.findSegment(segmentId);
    if (segment?.status !== 'closed') return;
    for (const participant of segment.participants) {
      const pending = await this.store.findSegmentedPendingSessions(participant.usageId, segment.meterId);
      for (const session of pending) {
        await this.settleSegmentedLate(session.id).catch((error) =>
          this.logger.warn(`Billing the share of meter session ${session.id} failed: ${String(error)}`),
        );
      }
    }
  }

  /** The bill of an ended usage is completed and immutable: its share goes onto a correction, once. */
  async settleSegmentedLate(sessionId: string, initiatorId?: number): Promise<void> {
    await this.unitOfWork.run(async (scope) => {
      const session = await this.requireSession(sessionId, scope);
      if (session.status !== ResourceMeteringSessionStatus.Pending) return;
      const usage = await this.requireBillableUsage(session.usageId, scope);
      if (!usage.endTime) return;
      const billed = await this.segmentedItem(scope, session);
      if (billed === 'abandoned') {
        await this.store.failSessions([session.id], REINITIALIZED, scope);
        return;
      }
      if (!billed) return;
      const settled = {
        status: ResourceMeteringSessionStatus.Settled,
        consumedValue: billed.share.quantity.toString(),
        chargeCredits: billed.share.credits,
        failureReason: null,
        settledAt: new Date(),
      };
      if (billed.share.credits === 0) {
        await this.store.updateSession(session.id, settled, scope);
        return;
      }
      const original = await this.store.requireBillOfUsage(usage.id, true, scope);
      const factor = usage.billingFactor ?? usage.userBillingFactor;
      const discount = partMeterDiscount(billed.priorConsumption, billed.share.credits, session.creditsPerUnit, factor);
      const correction = await this.store.createCorrection(
        {
          userId: original.userId,
          initiatorId: initiatorId ?? null,
          correctionOfId: original.id,
          amount: -(billed.share.credits - discount),
        },
        scope,
      );
      await this.store.addBillItem(correction.id, billed.item, scope);
      if (discount !== 0) {
        await this.store.addBillItem(
          correction.id,
          {
            name: 'BILLING_FACTOR',
            description: `${factor}%`,
            externalReference: `metering:${session.id}:segments:discount`,
            unitPrice: -discount,
            quantity: 1,
          },
          scope,
        );
      }
      await this.store.updateSession(session.id, settled, scope);
      await this.audit.record(
        billingTransactionAuditEvent({
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'meter-correction',
        }),
        scope,
      );
      this.announceCorrection(scope, correction.id);
    });
  }

  protected async addMeterItem(
    context: TransactionContext,
    billId: number,
    session: ResourceMeteringSessionRecord,
    operation: ResourceMeteringOperationRecord,
    /** What the earlier parts of the session's run consumed on the meter (see `partMeterCharge`). */
    priorConsumption: bigint,
  ): Promise<number> {
    const externalReference = `metering:${session.id}:${operation.id}`;
    const charge = partMeterCharge(priorConsumption, BigInt(operation.totalValue as string), session.creditsPerUnit);
    if (await this.store.hasBillItem(billId, externalReference, context)) return charge;
    await this.store.addBillItem(
      billId,
      {
        name: session.meterName,
        description: null,
        externalReference,
        unitPrice: charge,
        quantity: 1,
        meterQuantity: formatMeterValue(BigInt(operation.totalValue as string)),
        meterCreditsPerUnit: session.creditsPerUnit,
      },
      context,
    );
    return charge;
  }

  protected async settleSession(
    context: TransactionContext,
    session: ResourceMeteringSessionRecord,
    final: MeterFinal,
  ): Promise<void> {
    const usageId = session.usageId;
    if (session.accounting === 'segmented') return this.settleSegmentedSession(context, session, final);
    const operation =
      final.status === 'ready'
        ? await this.store.findCompletedFinalOperation(final.operationId, session.id, context)
        : null;
    if (!operation) {
      await this.addUnavailableItem(
        context,
        usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      // A measuring point of its own is never taken over by a later session.
      const superseded =
        session.accounting === 'per-session'
          ? false
          : await this.store.hasLaterSession(session.resourceId, session.meterId, usageId, context);
      const unrecoverable = superseded || !!session.compromisedReason;
      await this.store.updateSession(
        session.id,
        {
          status: unrecoverable ? ResourceMeteringSessionStatus.Failed : ResourceMeteringSessionStatus.Pending,
          failureReason: unreadReason(session, final, superseded),
        },
        context,
      );
      return;
    }
    const transaction = await this.store.requireBillOfUsage(usageId, false, context);
    const prior = await priorConsumptionOf(this.store, session, context);
    const charge = await this.addMeterItem(context, transaction.id, session, operation, prior);
    await this.store.updateSession(
      session.id,
      {
        status: ResourceMeteringSessionStatus.Settled,
        consumedValue: operation.totalValue,
        chargeCredits: charge,
        finalOperationId: operation.id,
        failureReason: null,
        settledAt: new Date(),
      },
      context,
    );
  }

  protected async addUnavailableItem(
    context: TransactionContext,
    usageId: number,
    name: string,
    creditsPerUnit: number,
    externalReference: string,
    allocation: BillingAllocationRecord | null = null,
  ): Promise<void> {
    const transaction = await this.store.requireBillOfUsage(usageId, false, context);
    if (await this.store.hasBillItem(transaction.id, externalReference, context)) return;
    await this.store.addBillItem(
      transaction.id,
      {
        name,
        description: null,
        externalReference,
        unitPrice: 0,
        quantity: 1,
        meterQuantity: null,
        meterCreditsPerUnit: creditsPerUnit,
        allocation,
      },
      context,
    );
  }

  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  async settleInTransaction(context: TransactionContext, usageId: number, final: FinalCollection): Promise<void> {
    const sessions = await this.store.findRunningSessionsOfUsage(usageId, context);
    for (const session of sessions) {
      const reading = final.status === 'collected' ? final.meters[session.id] : undefined;
      await this.settleSession(
        context,
        session,
        reading ?? { status: 'unavailable', reason: 'No final reading was collected' },
      );
    }
    // Best-effort meters can be skipped at start. Their captured terms still
    // belong on the receipt, with an unavailable quantity rather than a zero.
    const usage = await this.store.findUsage(usageId, context);
    if (!usage) throw new Error(`The usage ${usageId} does not exist`);
    const allSessions = await this.store.findSessionsOfUsage(usageId, context);
    for (const meter of usage.meterRates ?? []) {
      if (!allSessions.some((session) => session.meterId === meter.meterId)) {
        await this.addUnavailableItem(
          context,
          usageId,
          meter.name,
          meter.creditsPerUnit,
          `metering:${usageId}:skipped:${meter.meterId}`,
        );
      }
    }
  }
}
