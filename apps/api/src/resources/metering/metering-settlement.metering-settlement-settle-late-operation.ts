import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { meterCharge, meterDiscount } from './quantity';
import { MeteringSettlementAddMeterItemOperation } from './metering-settlement.metering-settlement-add-meter-item-operation';
export abstract class MeteringSettlementSettleLateOperation extends MeteringSettlementAddMeterItemOperation {
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
}
