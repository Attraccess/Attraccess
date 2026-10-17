import { BillingTransaction } from '@attraccess/application-models';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingLivePersistence } from '../persistence/port';
import { Subject } from 'rxjs';

export const SUMUP_TOPUP_TRANSACTION_PREFIX = 'sumup_topup_transaction';

@Injectable()
export class LiveNotificationsService {
  private readonly transactionSubjects: Map<number, Subject<{ data: BillingTransaction }>> = new Map();

  public constructor(private readonly persistence: BillingLivePersistence) {}

  public getTransactionSubject(userId: number): Subject<{ data: BillingTransaction }> {
    if (!this.transactionSubjects.has(userId)) {
      this.transactionSubjects.set(userId, new Subject<{ data: BillingTransaction }>());
    }
    return this.transactionSubjects.get(userId);
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    const subject = this.transactionSubjects.get(userId);
    if (subject && !subject.observed) {
      this.transactionSubjects.delete(userId);
    }
  }

  public async notifyTransactionUpdate(transactionOrId: BillingTransaction | number): Promise<void> {
    const transactionId = typeof transactionOrId === 'number' ? transactionOrId : transactionOrId.id;

    const transaction = await this.persistence.transactionWithItems(transactionId);
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    this.transactionSubjects.get(transaction.userId)?.next({ data: transaction });
  }
}
