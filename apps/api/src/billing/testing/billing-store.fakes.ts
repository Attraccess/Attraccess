import {
  BillingTransactionDetail,
  BillingTransactionRecord,
  BillingTransactionStatus,
  ProjectSwitchCharging,
  ResourceBillingConfigurationRecord,
  UsageReceiptSource,
} from '@attraccess/application-models';
import type { AuditEvent } from '../../audit/recorder/audit-event';
import { TransactionScope, UnitOfWork } from '../../database/unit-of-work';
import { BillingConfigurationStore, ResourceRates } from '../ports/billing-configuration.port';
import {
  BillingAuditFactory,
  BillingLedgerStore,
  BillingTransactionContext,
  ContinuedUsagePart,
  NewBillingTransaction,
  SettleUsageChargeInput,
} from '../ports/billing-ledger.port';

const NOW = new Date('2026-09-20T12:00:00.000Z');

/** A unit of work that runs `work` once, runs post-commit callbacks after it resolved and drops them on failure. */
export class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  /** Every scope a run opened, in order, so a spec can tell which unit of work a write joined. */
  readonly scopes: TransactionScope[] = [];
  private open: TransactionScope | undefined;

  current(): TransactionScope | undefined {
    return this.open;
  }

  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    if (this.open) return work(this.open);
    this.runs++;
    const callbacks: Array<() => void | Promise<void>> = [];
    const scope: TransactionScope = {
      isOpen: true,
      afterCommit: (callback) => void callbacks.push(callback),
    };
    this.open = scope;
    this.scopes.push(scope);
    let result: T;
    try {
      result = await work(scope);
    } finally {
      this.open = undefined;
    }
    for (const callback of callbacks) await callback();
    return result;
  }
}

export interface RecordedAudit {
  event: AuditEvent;
  context: BillingTransactionContext | undefined;
}

/** In-memory ledger: balances, transactions and the audit rows written with them. */
export class FakeBillingLedgerStore implements BillingLedgerStore {
  balances = new Map<number, number>();
  transactions: BillingTransactionRecord[] = [];
  audits: RecordedAudit[] = [];
  receipts = new Map<number, UsageReceiptSource>();
  contexts: Array<BillingTransactionContext | undefined> = [];
  /** Usages with a priced meter reading still pending: their bill is the anchor of a late meter correction. */
  pendingPricedMeterUsages = new Set<number>();
  private nextId = 1;

  getBalance(userId: number, context?: BillingTransactionContext): Promise<number | null> {
    this.contexts.push(context);
    return Promise.resolve(this.balances.get(userId) ?? null);
  }

  /** Parts of switched sessions by the usage id a read starts at, newest first. */
  continuedUsageParts = new Map<number, ContinuedUsagePart[]>();

  findContinuedUsageParts(usageId: number): Promise<ContinuedUsagePart[]> {
    return Promise.resolve(this.continuedUsageParts.get(usageId) ?? []);
  }

  findTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    const found = this.transactions.find((t) => t.resourceUsageId === usageId && t.userId === userId);
    return Promise.resolve(found?.id ?? null);
  }

  listTransactionsForUser(
    userId: number,
    { page, limit }: { page: number; limit: number },
  ): Promise<{ transactions: BillingTransactionDetail[]; total: number }> {
    const mine = this.transactions.filter((t) => t.userId === userId).sort((a, b) => b.id - a.id);
    return Promise.resolve({ transactions: mine.slice((page - 1) * limit, page * limit), total: mine.length });
  }

  findTransactionDetail(transactionId: number, ownerId?: number): Promise<BillingTransactionDetail | null> {
    const found = this.transactions.find(
      (t) => t.id === transactionId && (ownerId === undefined || t.userId === ownerId),
    );
    return Promise.resolve(found ?? null);
  }

  findTransactionWithItems(transactionId: number): Promise<BillingTransactionRecord | null> {
    return Promise.resolve(this.transactions.find((t) => t.id === transactionId) ?? null);
  }

  findCompletedUsageCharge(usageId: number, userId: number): Promise<BillingTransactionRecord | null> {
    const found = this.transactions.find(
      (t) => t.resourceUsageId === usageId && t.userId === userId && t.status === BillingTransactionStatus.Completed,
    );
    return Promise.resolve(found ?? null);
  }

  hasCompletedChargeForUsage(usageId: number, context?: BillingTransactionContext): Promise<boolean> {
    this.contexts.push(context);
    return Promise.resolve(
      this.transactions.some((t) => t.resourceUsageId === usageId && t.status === BillingTransactionStatus.Completed),
    );
  }

  findUsageTransaction(usageId: number, context?: BillingTransactionContext): Promise<BillingTransactionRecord | null> {
    this.contexts.push(context);
    const found = this.transactions.find((t) => t.resourceUsageId === usageId);
    // A copy, like a stored row read back: later writes must not change what the caller already holds.
    return Promise.resolve(found ? { ...found } : null);
  }

  insertTransaction(
    input: NewBillingTransaction,
    options: { context?: BillingTransactionContext; audit?: BillingAuditFactory } = {},
  ): Promise<BillingTransactionRecord> {
    const record: BillingTransactionRecord = {
      ...input,
      id: this.nextId++,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.transactions.push(record);
    this.applyBalance(record);
    if (options.audit) this.audits.push({ event: options.audit(record.id), context: options.context });
    return Promise.resolve(record);
  }

  settleUsageCharge(
    input: SettleUsageChargeInput,
    context?: BillingTransactionContext,
  ): Promise<BillingTransactionRecord> {
    this.contexts.push(context);
    let record: BillingTransactionRecord;
    if (input.existing) {
      record = this.transactions.find((t) => t.id === input.existing?.id) as BillingTransactionRecord;
      record.amount = input.amount;
      record.status = BillingTransactionStatus.Completed;
    } else {
      record = {
        id: this.nextId++,
        userId: input.userId,
        resourceUsageId: input.usageId,
        amount: input.amount,
        status: BillingTransactionStatus.Completed,
        createdAt: NOW,
        updatedAt: NOW,
      };
      this.transactions.push(record);
    }
    this.audits.push({ event: input.audit(record.id), context });
    record.items = [
      ...(record.items ?? []),
      ...input.items.map((item, index) => ({
        id: index + 1,
        billingTransactionId: record.id,
        description: null,
        externalReference: null,
        durationMs: null,
        meterQuantity: null,
        meterCreditsPerUnit: null,
        allocation: null,
        ...item,
      })),
    ];
    this.applyBalance(record);
    return Promise.resolve(record);
  }

  discardPendingUsageBill(usageId: number, context: BillingTransactionContext): Promise<boolean> {
    this.contexts.push(context);
    const index = this.transactions.findIndex(
      (t) =>
        t.resourceUsageId === usageId &&
        t.status !== BillingTransactionStatus.Completed &&
        !this.transactions.some((other) => other.refundOfId === t.id || other.correctionOfId === t.id),
    );
    if (index < 0 || this.pendingPricedMeterUsages.has(usageId)) return Promise.resolve(false);
    this.transactions.splice(index, 1);
    return Promise.resolve(true);
  }

  findTransactionByExternalReference(reference: string): Promise<BillingTransactionRecord | null> {
    return Promise.resolve(this.transactions.find((t) => t.externalReference === reference) ?? null);
  }

  listPendingTransactions(): Promise<BillingTransactionRecord[]> {
    return Promise.resolve(this.transactions.filter((t) => t.status === BillingTransactionStatus.Pending));
  }

  updateTransactionStatus(transactionId: number, status: BillingTransactionStatus): Promise<BillingTransactionRecord> {
    const record = this.transactions.find((t) => t.id === transactionId) as BillingTransactionRecord;
    record.status = status;
    this.applyBalance(record);
    return Promise.resolve(record);
  }

  findUsageReceipt(transactionId: number): Promise<UsageReceiptSource | null> {
    return Promise.resolve(this.receipts.get(transactionId) ?? null);
  }

  /** Mirrors the database triggers: a completed transaction moves the balance once. */
  private applied = new Set<number>();
  private applyBalance(record: BillingTransactionRecord): void {
    if (record.status !== BillingTransactionStatus.Completed || this.applied.has(record.id)) return;
    this.applied.add(record.id);
    this.balances.set(record.userId, (this.balances.get(record.userId) ?? 0) + record.amount);
  }
}

export class FakeBillingConfigurationStore implements BillingConfigurationStore {
  currency: string | null = null;
  configurations = new Map<number, ResourceBillingConfigurationRecord>();
  pricedMeterResources = new Set<number>();
  created: number[] = [];

  getCurrency(): Promise<string | null> {
    return Promise.resolve(this.currency);
  }

  saveCurrency(currency: string): Promise<void> {
    this.currency = currency;
    return Promise.resolve();
  }

  findResourceConfiguration(resourceId: number): Promise<ResourceBillingConfigurationRecord | null> {
    return Promise.resolve(this.configurations.get(resourceId) ?? null);
  }

  async getOrCreateResourceConfiguration(resourceId: number): Promise<ResourceBillingConfigurationRecord> {
    const existing = this.configurations.get(resourceId);
    if (existing) return existing;
    this.created.push(resourceId);
    return this.configure(resourceId, { creditsPerUsage: 0, creditsPerMinute: 0, creditsPerOperatingMinute: 0 });
  }

  saveResourceRates(resourceId: number, rates: ResourceRates): Promise<ResourceBillingConfigurationRecord> {
    return Promise.resolve(this.configure(resourceId, rates));
  }

  hasPricedMeter(resourceId: number): Promise<boolean> {
    return Promise.resolve(this.pricedMeterResources.has(resourceId));
  }

  /** Test setup: stores a resource's configuration. */
  configure(resourceId: number, rates: Partial<ResourceRates> = {}): ResourceBillingConfigurationRecord {
    const record: ResourceBillingConfigurationRecord = {
      id: resourceId,
      createdAt: NOW,
      updatedAt: NOW,
      resourceId,
      creditsPerUsage: 0,
      creditsPerMinute: 0,
      creditsPerOperatingMinute: 0,
      projectSwitchCharging: ProjectSwitchCharging.CONTINUE,
      ...rates,
    };
    this.configurations.set(resourceId, record);
    return record;
  }
}
