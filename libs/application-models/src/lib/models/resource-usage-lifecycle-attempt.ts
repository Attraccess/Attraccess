import { Resource } from './resource';
import { FormSubmissionDraft } from './form';
import { BillingTransactionItem } from './billing-transaction-item';

export type LifecycleBillingItem = Pick<
  BillingTransactionItem,
  'name' | 'description' | 'externalReference' | 'unitPrice' | 'quantity'
> & { usageId: number };

/** A reservation, never a completed usage or bill. Interrupted attempts are aborted, not replayed. */
export interface ResourceUsageLifecycleAttempt {
  id: string;
  resourceId: number;
  resource: Resource;
  kind: 'start' | 'end' | 'takeover';
  candidateUsageId: number | null;
  previousUsageId: number | null;
  transitionTime: Date;
  formSubmissions: FormSubmissionDraft[];
  billingItems: LifecycleBillingItem[];
  createdAt: Date;
}
