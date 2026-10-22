import { BillingTransaction } from './billing-transaction';

export interface BillingTransactionItem {
  id: number;
  billingTransactionId: number;
  billingTransaction: BillingTransaction;
  name: string;
  description: string | null;
  externalReference: string | null;
  unitPrice: number;
  quantity: number;
  durationMs: number | null;
  meterQuantity: string | null;
  meterCreditsPerUnit: number | null;
}
