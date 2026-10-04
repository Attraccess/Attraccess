import { ConflictException, Logger } from '@nestjs/common';
import { EntityManager, In, MoreThan, Repository } from 'typeorm';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { formatMeterValue, meterCharge, meterDiscount } from './quantity';

export type MeterFinal = { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };
export type FinalCollection = { status: 'not-metered' } | { status: 'collected'; meters: Record<string, MeterFinal> };

/** Settles meter evidence onto usage bills and immutable-bill corrections. */
export class MeteringSettlement {
  constructor(
    private readonly sessions: Repository<ResourceMeteringSession>,
    private readonly audit: AuditService,
    private readonly liveNotifications: LiveNotificationsService,
    private readonly logger: Logger,
  ) {}

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
  }

  private async settleSession(
    manager: EntityManager,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void> {
    const usageId = session.usageId;
    const operation =
      final.status === 'ready'
        ? await manager.findOne(ResourceMeteringOperation, {
            where: { id: final.operationId, sessionId: session.id, kind: 'final', status: 'completed' },
          })
        : null;
    if (!operation) {
      const superseded = await manager.count(ResourceMeteringSession, {
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
    if (session.creditsPerUnit > 0) {
      const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: usageId } });
      await this.addMeterItem(manager, transaction, session, operation);
    }
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedValue: operation.totalValue,
      chargeCredits: meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  private async addMeterItem(
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
      void this.audit.recordBillingTransactionAfterCommit(
        {
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'meter-correction',
        },
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
    void this.audit.recordResource({
      action: 'meter_charge.waived',
      actorId: initiatorId,
      subjectId: resourceId,
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
}
