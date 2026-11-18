import type { TransactionContext } from '../../database/transaction-context';

export const FLOW_BILLING_ITEM_STORE = Symbol.for('attraccess.flows.billing-item-store');

export interface PendingBillingItem {
  name: string;
  description: string | undefined;
  externalReference: string | undefined;
  unitPrice: number;
  quantity: number;
}

/** The billing side of the "set additional billing items" node. */
export interface FlowBillingItemStore {
  /**
   * Adds the item to the pending bill of the usage on the resource; an identical item (same bill, name,
   * description, reference and unit price) only gains quantity. Returns false when the usage has no pending bill.
   * Runs in the given transaction.
   */
  addToPendingBill(
    usage: { usageId: number; resourceId: number },
    item: PendingBillingItem,
    context: TransactionContext,
  ): Promise<boolean>;
}
