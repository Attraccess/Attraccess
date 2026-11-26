import { BillingTransactionRecord } from '@attraccess/application-models';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { BILLING_LEDGER_STORE, BillingLedgerStore } from '../ports/billing-ledger.port';

export const SUMUP_TOPUP_TRANSACTION_PREFIX = 'sumup_topup_transaction';

@Injectable()
export class LiveNotificationsService {
  private readonly transactionSubjects: Map<number, Subject<{ data: BillingTransactionRecord }>> = new Map();

  public constructor(@Inject(BILLING_LEDGER_STORE) private readonly ledgerStore: BillingLedgerStore) {}

  public getTransactionSubject(userId: number): Subject<{ data: BillingTransactionRecord }> {
    if (!this.transactionSubjects.has(userId)) {
      this.transactionSubjects.set(userId, new Subject<{ data: BillingTransactionRecord }>());
    }
    return this.transactionSubjects.get(userId);
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    const subject = this.transactionSubjects.get(userId);
    if (subject && !subject.observed) {
      this.transactionSubjects.delete(userId);
    }
  }

  public async notifyTransactionUpdate(transactionOrId: { id: number } | number): Promise<void> {
    const transactionId = typeof transactionOrId === 'number' ? transactionOrId : transactionOrId.id;

    const transaction = await this.ledgerStore.findTransactionWithItems(transactionId);
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    this.transactionSubjects.get(transaction.userId)?.next({ data: transaction });
  }

  /**
   * Publishes a transaction that was deleted, as it was before, for example the pending bill of a session without any
   * charge. A subscriber that shows it loads its list again.
   */
  public notifyTransactionRemoved(transaction: BillingTransactionRecord): void {
    this.transactionSubjects.get(transaction.userId)?.next({ data: transaction });
  }
}
