import { billingTransactionAuditEvent } from '../../audit/policies/billing';
import { Logger, ConflictException, Inject } from '@nestjs/common';

import { Repository, In, EntityManager, IsNull, MoreThan, MoreThanOrEqual } from 'typeorm';

import {
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceUsage,
} from '@attraccess/database-entities';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { LiveNotificationsService } from '../../billing/live-notifications/live-notifications.service';

import { meterCharge, meterDiscount, formatMeterValue } from './quantity';

import { runSerializedTransaction } from '../../database/run-serialized-transaction';

import { sessionShare } from './segment-charges';

export type MeterFinal = { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };

export type FinalCollection = { status: 'not-metered' } | { status: 'collected'; meters: Record<string, MeterFinal> };

export class MeteringSettlement {
  public constructor(
    protected readonly sessions: Repository<ResourceMeteringSession>,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
    protected readonly liveNotifications: LiveNotificationsService,
    protected readonly logger: Logger,
  ) {}

  async waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const result = await this.sessions.update(
      {
        id: sessionId,
        resourceId,
        status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
      },
      { status: ResourceMeteringSessionStatus.Waived, settledAt: new Date() },
    );
    if (!result.affected) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const session = await this.sessions.findOneByOrFail({ id: sessionId });
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

  /** The usage's bill is completed and immutable: the meter consumption goes onto a new correction transaction. */
  async settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void> {
    const correction = await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: sessionId } });
      if (session.status !== ResourceMeteringSessionStatus.Pending) return null;
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, relations: ['user'] });
      if (session.creditsPerUnit === 0) {
        await manager.update(ResourceMeteringSession, session.id, {
          status: ResourceMeteringSessionStatus.Settled,
          consumedValue: operation.totalValue,
          chargeCredits: 0,
          finalOperationId: operation.id,
          failureReason: null,
          settledAt: new Date(),
        });
        return null;
      }
      const original = await manager.findOneOrFail(BillingTransaction, {
        where: { resourceUsageId: usage.id, status: BillingTransactionStatus.Completed },
      });
      const charge = meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit);
      const factor = usage.billingFactor ?? usage.user.billingFactor;
      const discount = meterDiscount(charge, factor);
      const correction = await manager.save(BillingTransaction, {
        userId: original.userId,
        initiatorId,
        correctionOfId: original.id,
        amount: -(charge - discount),
        status: BillingTransactionStatus.Completed,
      });
      await this.addMeterItem(manager, correction, session, operation);
      if (discount !== 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: correction.id,
          name: 'BILLING_FACTOR',
          description: `${factor}%`,
          externalReference: `metering:${session.id}:${operation.id}:discount`,
          unitPrice: -discount,
          quantity: 1,
        });
      }
      await manager.update(ResourceMeteringSession, session.id, {
        status: ResourceMeteringSessionStatus.Settled,
        consumedValue: operation.totalValue,
        chargeCredits: charge,
        finalOperationId: operation.id,
        failureReason: null,
        settledAt: new Date(),
      });
      await this.audit.record(
        billingTransactionAuditEvent({
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'meter-correction',
        }),
        manager,
      );
      return correction;
    });
    if (correction) {
      this.liveNotifications
        .notifyTransactionUpdate(correction.id)
        .catch((error) => this.logger.warn(`Failed to publish meter correction ${correction.id}`, error));
    }
  }


  /** The closed or open segments a usage took part in, oldest first. Segments that were abandoned are no longer billable. */
  protected async segmentsOf(manager: EntityManager, session: ResourceMeteringSession, usage: ResourceUsage) {
    const candidates = await manager.find(ResourceMeteringSegment, {
      where: [
        { meterId: session.meterId, endedAt: MoreThanOrEqual(usage.startTime) },
        { meterId: session.meterId, endedAt: IsNull() },
      ],
      order: { startedAt: 'ASC' },
    });
    return candidates.filter(
      (segment) =>
        segment.status !== 'abandoned' && segment.participants.some((participant) => participant.usageId === usage.id),
    );
  }

  /** The item a session's shares of its shared segments become. Null while a segment it took part in is still open. */
  protected async segmentedItem(manager: EntityManager, session: ResourceMeteringSession) {
    const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
    const segments = await this.segmentsOf(manager, session, usage);
    if (!segments.length || segments.some((segment) => segment.status !== 'closed')) return null;
    const share = sessionShare(segments, usage.id);
    return {
      share,
      item: {
        name: session.meterName,
        description: null,
        externalReference: `metering:${session.id}:segments`,
        unitPrice: share.credits,
        quantity: 1,
        meterQuantity: formatMeterValue(share.quantity),
        meterCreditsPerUnit: session.creditsPerUnit,
        allocation: share.solo ? null : { kind: 'meter' as const, segments: share.breakdown },
      },
    };
  }

  /**
   * A session that shared the meter is billed its shares once every segment it took part in is closed. A segment
   * whose closing reading failed keeps the meter line pending until a later reading closes it.
   */
  protected async settleSegmentedSession(
    manager: EntityManager,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void> {
    const billed = await this.segmentedItem(manager, session);
    if (!billed) {
      await this.addUnavailableItem(
        manager,
        session.usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      await manager.update(ResourceMeteringSession, session.id, {
        status: ResourceMeteringSessionStatus.Pending,
        failureReason:
          final.status === 'unavailable'
            ? final.reason
            : 'The meter could not be read when the session ended; its share is billed once a later reading succeeds',
      });
      return;
    }
    const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: session.usageId } });
    if (
      !(await manager.exists(BillingTransactionItem, {
        where: { billingTransactionId: transaction.id, externalReference: billed.item.externalReference },
      }))
    )
      await manager.save(BillingTransactionItem, { billingTransactionId: transaction.id, ...billed.item });
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedValue: billed.share.quantity.toString(),
      chargeCredits: billed.share.credits,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  /** A closed segment makes its share known to sessions that already ended: they are billed as a correction. */
  async settleClosedSegment(segmentId: string): Promise<void> {
    const segment = await this.sessions.manager.findOne(ResourceMeteringSegment, { where: { id: segmentId } });
    if (segment?.status !== 'closed') return;
    for (const participant of segment.participants) {
      const pending = await this.sessions.find({
        where: {
          usageId: participant.usageId,
          meterId: segment.meterId,
          accounting: 'segmented',
          status: ResourceMeteringSessionStatus.Pending,
        },
      });
      for (const session of pending) {
        await this.settleSegmentedLate(session.id).catch((error) =>
          this.logger.warn(`Billing the share of meter session ${session.id} failed: ${String(error)}`),
        );
      }
    }
  }

  /** The bill of an ended usage is completed and immutable: its share goes onto a correction, once. */
  async settleSegmentedLate(sessionId: string, initiatorId?: number): Promise<void> {
    const correction = await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: sessionId } });
      if (session.status !== ResourceMeteringSessionStatus.Pending) return null;
      const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, relations: ['user'] });
      if (!usage.endTime) return null;
      const billed = await this.segmentedItem(manager, session);
      if (!billed) return null;
      const settled = {
        status: ResourceMeteringSessionStatus.Settled,
        consumedValue: billed.share.quantity.toString(),
        chargeCredits: billed.share.credits,
        failureReason: null,
        settledAt: new Date(),
      };
      if (billed.share.credits === 0) {
        await manager.update(ResourceMeteringSession, session.id, settled);
        return null;
      }
      const original = await manager.findOneOrFail(BillingTransaction, {
        where: { resourceUsageId: usage.id, status: BillingTransactionStatus.Completed },
      });
      const factor = usage.billingFactor ?? usage.user.billingFactor;
      const discount = meterDiscount(billed.share.credits, factor);
      const correction = await manager.save(BillingTransaction, {
        userId: original.userId,
        initiatorId: initiatorId ?? null,
        correctionOfId: original.id,
        amount: -(billed.share.credits - discount),
        status: BillingTransactionStatus.Completed,
      });
      await manager.save(BillingTransactionItem, { billingTransactionId: correction.id, ...billed.item });
      if (discount !== 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: correction.id,
          name: 'BILLING_FACTOR',
          description: `${factor}%`,
          externalReference: `metering:${session.id}:segments:discount`,
          unitPrice: -discount,
          quantity: 1,
        });
      }
      await manager.update(ResourceMeteringSession, session.id, settled);
      await this.audit.record(
        billingTransactionAuditEvent({
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'meter-correction',
        }),
        manager,
      );
      return correction;
    });
    if (correction) {
      this.liveNotifications
        .notifyTransactionUpdate(correction.id)
        .catch((error) => this.logger.warn(`Failed to publish meter correction ${correction.id}`, error));
    }
  }

  protected async addMeterItem(
    manager: EntityManager,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number> {
    const externalReference = `metering:${session.id}:${operation.id}`;
    const charge = meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit);
    if (
      await manager.findOne(BillingTransactionItem, {
        where: { billingTransactionId: transaction.id, externalReference },
      })
    ) {
      return charge;
    }
    await manager.save(BillingTransactionItem, {
      billingTransactionId: transaction.id,
      name: session.meterName,
      description: null,
      externalReference,
      unitPrice: charge,
      quantity: 1,
      meterQuantity: formatMeterValue(BigInt(operation.totalValue as string)),
      meterCreditsPerUnit: session.creditsPerUnit,
    });
    return charge;
  }

  protected async settleSession(
    manager: EntityManager,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void> {
    const usageId = session.usageId;
    if (session.accounting === 'segmented') return this.settleSegmentedSession(manager, session, final);
    const operation =
      final.status === 'ready'
        ? await manager.findOne(ResourceMeteringOperation, {
            where: { id: final.operationId, sessionId: session.id, kind: 'final', status: 'completed' },
          })
        : null;
    if (!operation) {
      await this.addUnavailableItem(
        manager,
        usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      // A measuring point of its own is never taken over by a later session.
      const superseded =
        session.accounting === 'per-session'
          ? 0
          : await manager.count(ResourceMeteringSession, {
              where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(usageId) },
            });
      const unrecoverable = superseded > 0 || !!session.compromisedReason;
      await manager.update(ResourceMeteringSession, session.id, {
        status: unrecoverable ? ResourceMeteringSessionStatus.Failed : ResourceMeteringSessionStatus.Pending,
        failureReason: superseded
          ? 'The meter was re-initialized for a later session before the final reading was collected'
          : session.compromisedReason
            ? session.compromisedReason
            : final.status === 'unavailable'
              ? final.reason
              : 'No final reading was collected',
      });
      return;
    }
    const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: usageId } });
    await this.addMeterItem(manager, transaction, session, operation);
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedValue: operation.totalValue,
      chargeCredits: meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  protected async addUnavailableItem(
    manager: EntityManager,
    usageId: number,
    name: string,
    creditsPerUnit: number,
    externalReference: string,
  ): Promise<void> {
    const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: usageId } });
    if (
      await manager.exists(BillingTransactionItem, {
        where: { billingTransactionId: transaction.id, externalReference },
      })
    )
      return;
    await manager.save(BillingTransactionItem, {
      billingTransactionId: transaction.id,
      name,
      description: null,
      externalReference,
      unitPrice: 0,
      quantity: 1,
      meterQuantity: null,
      meterCreditsPerUnit: creditsPerUnit,
    });
  }

  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  async settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void> {
    const sessions = await manager.find(ResourceMeteringSession, {
      where: { usageId, status: ResourceMeteringSessionStatus.Active },
    });
    for (const session of sessions) {
      const reading = final.status === 'collected' ? final.meters[session.id] : undefined;
      await this.settleSession(
        manager,
        session,
        reading ?? { status: 'unavailable', reason: 'No final reading was collected' },
      );
    }
    // Best-effort meters can be skipped at start. Their captured terms still
    // belong on the receipt, with an unavailable quantity rather than a zero.
    const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: usageId } });
    const allSessions = await manager.find(ResourceMeteringSession, { where: { usageId } });
    for (const meter of usage.meterRates ?? []) {
      if (!allSessions.some((session) => session.meterId === meter.meterId)) {
        await this.addUnavailableItem(
          manager,
          usageId,
          meter.name,
          meter.creditsPerUnit,
          `metering:${usageId}:skipped:${meter.meterId}`,
        );
      }
    }
  }
}
