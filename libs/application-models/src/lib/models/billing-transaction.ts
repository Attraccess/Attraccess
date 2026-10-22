import { User } from './user';
import { ResourceUsage } from './resourceUsage';
import { BillingTransactionItem as BillingTransactionItems } from './billing-transaction-item';

export enum BillingTransactionStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
}

export interface BillingTransaction {
  id: number;
  userId: number;
  user: User;
  createdAt: Date;
  updatedAt: Date;
  amount: number;
  initiatorId: number | null;
  initiator: User | null;
  resourceUsageId: number | null;
  resourceUsage: ResourceUsage | null;
  refundOfId: number | null;
  refundOf: BillingTransaction | null;
  correctionOfId: number | null;
  correctionOf?: BillingTransaction | null;
  externalReference: string | null;
  status: BillingTransactionStatus;
  items: BillingTransactionItems[];
}
