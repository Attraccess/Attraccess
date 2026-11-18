import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BillingTransaction, BillingTransactionItem } from '@attraccess/database-entities';
import { BillingTransactionStatus } from '@attraccess/application-models';
import type { TransactionContext } from '../../transaction-context';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import type { FlowBillingItemStore, PendingBillingItem } from '../../../resources/flows/flow-billing-item-store.port';
import { managerFor } from '../resources/persistence-context';

@Injectable()
export class TypeOrmFlowBillingItemStore implements FlowBillingItemStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>,
  ) {}

  async addToPendingBill(
    usage: { usageId: number; resourceId: number },
    item: PendingBillingItem,
    context: TransactionContext,
  ): Promise<boolean> {
    const manager = managerFor(context, this.dataSource.manager, this.unitOfWork);
    // The row lock makes a delayed event wait for a finalization that has already changed the bill: PostgreSQL then
    // re-checks the Pending status after the commit, so no item reaches a completed bill. Only the bill is locked
    // (`tables`), the joined usage row is not.
    const billingTransaction = await manager.findOne(BillingTransaction, {
      lock: { mode: 'pessimistic_write', tables: ['billing_transaction'] },
      where: {
        resourceUsageId: usage.usageId,
        resourceUsage: { resourceId: usage.resourceId },
        status: BillingTransactionStatus.Pending,
      },
    });
    if (!billingTransaction) return false;

    const { quantity, ...identity } = item;
    const dedupData = { billingTransactionId: billingTransaction.id, ...identity };
    const existingItem = await manager.findOne(BillingTransactionItem, { where: dedupData });
    if (existingItem) {
      await manager.update(BillingTransactionItem, existingItem.id, { quantity: existingItem.quantity + quantity });
    } else {
      await manager.save(BillingTransactionItem, { ...dedupData, quantity });
    }
    return true;
  }
}
