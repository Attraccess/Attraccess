import { operationToken } from '../../database/transaction-scope';
import type {
  BillingTransaction,
  BillingTransactionItem,
  ResourceBillingConfiguration,
} from '@attraccess/application-models';
export abstract class BillingLivePersistence {
  abstract transactionWithItems(id: number): Promise<BillingTransaction | null>;
}
export type PendingTopup = Pick<BillingTransaction, 'userId' | 'amount' | 'externalReference' | 'status'>;
export abstract class SumupPersistence {
  abstract writeCredentials(encryptedApiKey: string, merchantCode: string): Promise<void>;
  abstract apiKey(): Promise<{ value: string } | null>;
  abstract merchantCode(): Promise<{ value: string } | null>;
  abstract transactionByReference(reference: string): Promise<BillingTransaction | null>;
  abstract saveTransaction(transaction: BillingTransaction): Promise<BillingTransaction>;
  abstract pendingTransactions(): Promise<BillingTransaction[]>;
  abstract createTopup(transaction: PendingTopup): Promise<BillingTransaction>;
}

export type NewBillingTransaction = Pick<BillingTransaction, 'userId' | 'amount' | 'status'> &
  Partial<Pick<BillingTransaction, 'initiatorId' | 'resourceUsageId' | 'refundOfId' | 'correctionOfId'>>;

export type NewBillingItem = Pick<BillingTransactionItem, 'billingTransactionId' | 'name' | 'unitPrice' | 'quantity'> &
  Partial<
    Pick<
      BillingTransactionItem,
      'durationMs' | 'description' | 'externalReference' | 'meterQuantity' | 'meterCreditsPerUnit'
    >
  >;
export abstract class BillingPersistence {
  abstract balance(userId: number): Promise<{ creditBalance: number } | null>;
  abstract transactionIdForUsage(usageId: number, userId: number): Promise<number | null>;
  abstract history(userId: number, skip: number, take: number): Promise<[BillingTransaction[], number]>;
  abstract transaction(id: number, userId?: number): Promise<BillingTransaction | null>;
  abstract completedUsageCharge(usageId: number, userId?: number): Promise<BillingTransaction | null>;
  abstract createTransaction(data: NewBillingTransaction): Promise<BillingTransaction>;
  abstract currency(): Promise<{ value: string } | null>;
  abstract setCurrency(value: string): Promise<void>;
  abstract resourceConfiguration(resourceId: number): Promise<ResourceBillingConfiguration | null>;
  abstract saveResourceConfiguration(
    data: Pick<
      ResourceBillingConfiguration,
      'resourceId' | 'creditsPerUsage' | 'creditsPerMinute' | 'creditsPerOperatingMinute'
    > &
      Partial<Pick<ResourceBillingConfiguration, 'id'>>,
  ): Promise<ResourceBillingConfiguration>;
  abstract positiveMeterCount(resourceId: number): Promise<number>;
  abstract itemByExternalReference(transactionId: number, reference: string): Promise<BillingTransactionItem | null>;
  abstract itemReferenceExists(transactionId: number, reference: string): Promise<boolean>;
  abstract pendingUsageTransaction(resourceId: number, usageId: number): Promise<BillingTransaction | null>;
  abstract matchingPendingItem(
    transactionId: number,
    item: Pick<BillingTransactionItem, 'name' | 'description' | 'externalReference' | 'unitPrice'>,
  ): Promise<BillingTransactionItem | null>;
  abstract usageTransaction(usageId: number): Promise<BillingTransaction | null>;
  abstract matchingItem(
    transactionId: number,
    item: Pick<BillingTransactionItem, 'name' | 'description' | 'externalReference' | 'unitPrice'>,
  ): Promise<BillingTransactionItem | null>;
  abstract updateItemQuantity(itemId: number, quantity: number): Promise<void>;
  abstract usageTransactionWithItems(usageId: number): Promise<BillingTransaction | null>;
  abstract completeTransaction(id: number, amount: number): Promise<void>;
  abstract saveItem(data: NewBillingItem): Promise<void>;
  abstract chargeForNotification(transactionId: number): Promise<BillingTransaction | null>;
}
export const BILLING_OPERATIONS = operationToken<BillingPersistence>('billing ledger', [
  'balance',
  'transactionIdForUsage',
  'history',
  'transaction',
  'completedUsageCharge',
  'createTransaction',
  'currency',
  'setCurrency',
  'resourceConfiguration',
  'saveResourceConfiguration',
  'positiveMeterCount',
  'itemByExternalReference',
  'itemReferenceExists',
  'pendingUsageTransaction',
  'matchingPendingItem',
  'usageTransaction',
  'matchingItem',
  'updateItemQuantity',
  'usageTransactionWithItems',
  'completeTransaction',
  'saveItem',
  'chargeForNotification',
]);
