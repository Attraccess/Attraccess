import { AUDIT_COMMIT_BOUNDARY } from '../../audit/persistence/port';
import { Logger, ConflictException } from '@nestjs/common';

import { DatabaseTransactions, TransactionScope } from '../../database/transaction-scope';
import { MeteringPersistence, METERING_OPERATIONS } from './persistence/port';
import { BILLING_OPERATIONS } from '../../billing/persistence/port';
import { requireMeteringRecord } from './metering-catalog';

import {
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  BillingTransaction,
  BillingTransactionStatus,
  ResourceMeteringOperation,
} from '@attraccess/application-models';

import { AuditService } from '../../audit/audit.service';

import { LiveNotificationsService } from '../../billing/live-notifications/live-notifications.service';

import { meterCharge, meterDiscount, formatMeterValue } from './quantity';

export type MeterFinal = { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };

export type FinalCollection = { status: 'not-metered' } | { status: 'collected'; meters: Record<string, MeterFinal> };

export class MeteringSettlement {
  public constructor(
    protected readonly persistence: MeteringPersistence,
    protected readonly transactions: DatabaseTransactions,
    protected readonly audit: AuditService,
    protected readonly liveNotifications: LiveNotificationsService,
    protected readonly logger: Logger,
  ) {}

  protected bound(scope?: TransactionScope): MeteringPersistence {
    return scope ? scope.resolve(METERING_OPERATIONS) : this.persistence;
  }

  async waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const session = await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (scope) => {
      const affected = await this.bound(scope).waiveSession(resourceId, sessionId, new Date());
      if (!affected) throw new ConflictException('METER_SESSION_NOT_PENDING');
      return requireMeteringRecord(await this.bound(scope).session(sessionId), 'session');
    });
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

  /** The usage's bill is completed and immutable: the meter consumption goes onto a new correction transaction. */
  async settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void> {
    const reference = requireMeteringRecord(await this.persistence.session(sessionId), 'session');
    const referenceUsage = requireMeteringRecord(await this.persistence.usage(reference.usageId), 'usage');
    const correction = await this.transactions.run(
      { resourceIds: [reference.resourceId], accountIds: referenceUsage.userId == null ? [] : [referenceUsage.userId] },
      async (manager) => {
        const session = requireMeteringRecord(await this.bound(manager).session(sessionId), 'session');
        if (session.status !== ResourceMeteringSessionStatus.Pending) return null;
        const operation = requireMeteringRecord(await this.bound(manager).operation(operationId), 'operation');
        const usage = requireMeteringRecord(await this.bound(manager).usage(session.usageId, true), 'usage');
        if (session.creditsPerUnit === 0) {
          await this.bound(manager).updateSession(session.id, {
            status: ResourceMeteringSessionStatus.Settled,
            consumedValue: operation.totalValue,
            chargeCredits: 0,
            finalOperationId: operation.id,
            failureReason: null,
            settledAt: new Date(),
          });
          return null;
        }
        const original = requireMeteringRecord(
          await manager.resolve(BILLING_OPERATIONS).completedUsageCharge(usage.id),
          'billing transaction',
        );
        const charge = meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit);
        const factor = usage.billingFactor ?? usage.user.billingFactor;
        const discount = meterDiscount(charge, factor);
        const correction = await manager.resolve(BILLING_OPERATIONS).createTransaction({
          userId: original.userId,
          initiatorId,
          correctionOfId: original.id,
          amount: -(charge - discount),
          status: BillingTransactionStatus.Completed,
        });
        await this.addMeterItem(manager, correction, session, operation);
        if (discount !== 0) {
          await manager.resolve(BILLING_OPERATIONS).saveItem({
            billingTransactionId: correction.id,
            name: 'BILLING_FACTOR',
            description: `${factor}%`,
            externalReference: `metering:${session.id}:${operation.id}:discount`,
            unitPrice: -discount,
            quantity: 1,
          });
        }
        await this.bound(manager).updateSession(session.id, {
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
          manager.resolve(AUDIT_COMMIT_BOUNDARY),
        );
        return correction;
      },
    );
    if (correction) {
      this.liveNotifications
        .notifyTransactionUpdate(correction.id)
        .catch((error) => this.logger.warn(`Failed to publish meter correction ${correction.id}`, error));
    }
  }

  protected async addMeterItem(
    manager: TransactionScope,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number> {
    const externalReference = `metering:${session.id}:${operation.id}`;
    const charge = meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit);
    if (await manager.resolve(BILLING_OPERATIONS).itemByExternalReference(transaction.id, externalReference)) {
      return charge;
    }
    await manager.resolve(BILLING_OPERATIONS).saveItem({
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
    manager: TransactionScope,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void> {
    const usageId = session.usageId;
    const operation =
      final.status === 'ready' ? await this.bound(manager).finalOperation(final.operationId, session.id) : null;
    if (!operation) {
      await this.addUnavailableItem(
        manager,
        usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      const superseded = await this.bound(manager).newerSessionCount(session.resourceId, session.meterId, usageId);
      const unrecoverable = superseded > 0 || !!session.compromisedReason;
      await this.bound(manager).updateSession(session.id, {
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
    const transaction = requireMeteringRecord(
      await manager.resolve(BILLING_OPERATIONS).usageTransaction(usageId),
      'billing transaction',
    );
    await this.addMeterItem(manager, transaction, session, operation);
    await this.bound(manager).updateSession(session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedValue: operation.totalValue,
      chargeCredits: meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  protected async addUnavailableItem(
    manager: TransactionScope,
    usageId: number,
    name: string,
    creditsPerUnit: number,
    externalReference: string,
  ): Promise<void> {
    const transaction = requireMeteringRecord(
      await manager.resolve(BILLING_OPERATIONS).usageTransaction(usageId),
      'billing transaction',
    );
    if (await manager.resolve(BILLING_OPERATIONS).itemReferenceExists(transaction.id, externalReference)) return;
    await manager.resolve(BILLING_OPERATIONS).saveItem({
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
  async settleInTransaction(manager: TransactionScope, usageId: number, final: FinalCollection): Promise<void> {
    const sessions = await this.bound(manager).activeSessions(usageId);
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
    const usage = requireMeteringRecord(await this.bound(manager).usage(usageId), 'usage');
    const allSessions = await this.bound(manager).sessions(usageId);
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
