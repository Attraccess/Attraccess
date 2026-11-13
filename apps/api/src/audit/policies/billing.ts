import type { AuditEvent } from '../recorder/audit-event';
import { dataFields, positive } from './projection';

export const billingStatuses = new Set(['pending', 'completed', 'failed']);

export const billingSources = new Set([
  'manual',
  'resource-usage',
  'refund',
  'sumup-topup',
  'energy-correction',
  'meter-correction',
]);

/** Scalar transaction fields a billing audit event is built from, never provider payloads. */
export interface BillingTransactionAuditFacts {
  transactionId: number;
  userId: number;
  initiatorId?: number | null;
  amount: number;
  status: string;
  previousStatus?: string;
  source: string;
}

/** The billing envelope: one deterministic operation per transaction, acted on by the initiator or the owner. */
export function billingTransactionAuditEvent(facts: BillingTransactionAuditFacts): AuditEvent<'billing'> {
  return {
    domain: 'billing',
    action: facts.previousStatus === undefined ? 'billing.transaction.created' : 'billing.transaction.updated',
    operationId: `billing-transaction-${facts.transactionId}`,
    // An invalid owner makes the event invalid even when an initiator is set.
    actor: { id: positive(facts.userId) ? (facts.initiatorId ?? facts.userId) : 0, authenticationMethod: 'session' },
    subject: { type: 'billing.transaction', id: facts.transactionId },
    details: {
      amount: facts.amount,
      status: facts.status,
      ...(facts.previousStatus === undefined ? {} : { previousStatus: facts.previousStatus }),
      source: facts.source,
    },
  };
}

export function validBillingAuditEvent(event: AuditEvent<'billing'>): boolean {
  const { actor, subject } = event;
  const details = dataFields(event.details, ['amount', 'status', 'previousStatus', 'source']);
  if (!details) return false;
  const previousStatus = details.previousStatus;
  return (
    positive(subject.id) &&
    subject.type === 'billing.transaction' &&
    event.operationId === `billing-transaction-${subject.id}` &&
    positive(actor.id) &&
    actor.authenticationMethod === 'session' &&
    (actor.apiTokenId ?? null) === null &&
    Number.isSafeInteger(details.amount) &&
    billingStatuses.has(details.status as string) &&
    billingSources.has(details.source as string) &&
    (previousStatus === undefined
      ? event.action === 'billing.transaction.created'
      : event.action === 'billing.transaction.updated' && billingStatuses.has(previousStatus as string))
  );
}
