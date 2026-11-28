import type {
  BillingAllocationRecord,
  BillingTransactionDetail,
  BillingTransactionRecord,
  BillingTransactionStatus,
  ProjectSwitchCharging,
  SwitchedSessionCharge,
  UsageReceiptSource,
} from '@attraccess/application-models';
import type { TransactionScope } from '../../database/unit-of-work';
import type { AuditEvent } from '../../audit/recorder/audit-event';

/** The unit of work the caller already runs in; billing writes join it. */
export type BillingTransactionContext = TransactionScope;

export const BILLING_LEDGER_STORE = Symbol.for('attraccess.billing.ledger-store');

export interface NewBillingTransaction {
  userId: number;
  initiatorId?: number | null;
  amount: number;
  status: BillingTransactionStatus;
  resourceUsageId?: number;
  refundOfId?: number;
  externalReference?: string;
}

export interface NewBillingTransactionItem {
  name: string;
  description?: string | null;
  unitPrice: number;
  quantity: number;
  durationMs?: number;
  allocation?: BillingAllocationRecord;
}

/** Builds the audit event of a write once its transaction id is known; recorded inside the same transaction. */
export type BillingAuditFactory = (transactionId: number) => AuditEvent;

export interface SettleUsageChargeInput {
  /** The usage's open (pending) transaction, or null when none exists yet. */
  existing: BillingTransactionRecord | null;
  userId: number;
  usageId: number;
  /** The final amount, negative for a charge. */
  amount: number;
  /** The line items of the charge, in the order they are stored. */
  items: NewBillingTransactionItem[];
  audit: BillingAuditFactory;
}

/** An earlier part of a session whose project was switched, as far as billing a later part reads it. */
export interface ContinuedUsagePart {
  startTime: Date;
  attributedOperatingDurationInMinutes: number | null;
  /** Null on the part the session started with. */
  projectSwitchCharging: ProjectSwitchCharging | null;
  /**
   * What the part's own bill charged before the billing factor: all its items (fee, minutes, meters, flow items) but
   * the billing factor's. Late meter corrections of the part are not included.
   */
  grossCredits: bigint;
}

/** A usage that has not ended, with what pricing it reads. */
export interface RunningUsagePricing {
  userId: number | null;
  resourceId: number;
  startTime: Date;
  previousUsageId: number | null;
  projectSwitchCharging: ProjectSwitchCharging | null;
  creditsPerUsage: number | null;
  sessionDurationCreditsPerMinute: number | null;
  operatingDurationCreditsPerMinute: number | null;
}

/**
 * The billing ledger as the application needs it. Balances live on the user row and are changed by database
 * triggers when a completed transaction is written, so every write below changes the balance atomically with the
 * transaction row; nothing here reads, modifies and writes a balance.
 */
export interface BillingLedgerStore {
  /** The user's current credit balance, or null when the user does not exist. */
  getBalance(userId: number, context?: BillingTransactionContext): Promise<number | null>;

  /** The id of the user's own transaction for a usage, if any. */
  findTransactionIdForUsage(usageId: number, userId: number): Promise<number | null>;

  /**
   * The usage `usageId` and the parts before it, newest first, as far as they round their minutes together: the
   * walk ends at the first part that is not charged in the `continue` mode.
   */
  findContinuedUsageParts(usageId: number, context: BillingTransactionContext): Promise<ContinuedUsagePart[]>;

  /** The running usage `usageId`, or null when it does not exist or has ended. */
  findRunningUsagePricing(usageId: number, context: BillingTransactionContext): Promise<RunningUsagePricing | null>;

  /**
   * The user's charge of the session as far as the part `usageId`, and whether a later part continues it. Null when
   * the session was never switched.
   */
  findSwitchedSessionCharge(usageId: number, userId: number): Promise<SwitchedSessionCharge | null>;

  /** Newest first. */
  listTransactionsForUser(
    userId: number,
    page: { page: number; limit: number },
  ): Promise<{ transactions: BillingTransactionDetail[]; total: number }>;

  /** `ownerId` restricts the lookup to that user's transactions; without it any transaction matches. */
  findTransactionDetail(transactionId: number, ownerId?: number): Promise<BillingTransactionDetail | null>;

  /** The transaction with its line items, for live updates. */
  findTransactionWithItems(transactionId: number): Promise<BillingTransactionRecord | null>;

  findCompletedUsageCharge(usageId: number, userId: number): Promise<BillingTransactionRecord | null>;

  hasCompletedChargeForUsage(usageId: number, context?: BillingTransactionContext): Promise<boolean>;

  /** The usage's transaction in any status, with its items. */
  findUsageTransaction(usageId: number, context?: BillingTransactionContext): Promise<BillingTransactionRecord | null>;

  /** Writes one transaction. With `audit`, the audit row is recorded inside the same transaction. */
  insertTransaction(
    input: NewBillingTransaction,
    options?: { context?: BillingTransactionContext; audit?: BillingAuditFactory },
  ): Promise<BillingTransactionRecord>;

  /**
   * Completes the charge of a usage: updates the open transaction or inserts a completed one, records its audit
   * event and stores the line items, all in one atomic unit (the caller's transaction, or one of its own).
   */
  settleUsageCharge(
    input: SettleUsageChargeInput,
    context?: BillingTransactionContext,
  ): Promise<BillingTransactionRecord>;

  /**
   * Deletes the usage's bill and its items while the bill is not completed, under the bill row lock: a usage that ends
   * without any charge leaves no transaction. The bill stays when a priced meter reading of the usage is still
   * pending (a late meter correction refers to the completed bill) or another transaction refers to it. Returns
   * whether the bill was deleted.
   */
  discardPendingUsageBill(usageId: number, context: BillingTransactionContext): Promise<boolean>;

  findTransactionByExternalReference(reference: string): Promise<BillingTransactionRecord | null>;

  listPendingTransactions(): Promise<BillingTransactionRecord[]>;

  updateTransactionStatus(transactionId: number, status: BillingTransactionStatus): Promise<BillingTransactionRecord>;

  /** The completed transaction of a usage with the owner and usage the receipt mail needs. */
  findUsageReceipt(transactionId: number): Promise<UsageReceiptSource | null>;
}
