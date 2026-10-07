import { EntityManager } from 'typeorm';
import { BillingTransaction, BillingTransactionItem } from '@attraccess/database-entities';
import { MeteringSettlementSettleInTransactionOperation } from './metering-settlement.metering-settlement-settle-in-transaction-operation';
export abstract class MeteringSettlementAddUnavailableItemOperation extends MeteringSettlementSettleInTransactionOperation {
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
}
