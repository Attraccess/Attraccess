import { EntityManager } from 'typeorm';
import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceMeteringOperation,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { formatMeterValue, meterCharge } from './quantity';
import { MeteringSettlementSettleSessionOperation } from './metering-settlement.metering-settlement-settle-session-operation';
export abstract class MeteringSettlementAddMeterItemOperation extends MeteringSettlementSettleSessionOperation {
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
}
