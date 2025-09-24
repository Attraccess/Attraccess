import { BillingTransaction } from '@attraccess/database-entities';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Subject } from 'rxjs';
import { Repository } from 'typeorm';

export const SUMUP_TOPUP_TRANSACTION_PREFIX = 'sumup_topup_transaction';

@Injectable()
export class LiveNotificationsService {
  private readonly transactionSubjects: Map<number, Subject<{ data: BillingTransaction }>> = new Map();

  public constructor(
    @InjectRepository(BillingTransaction)
    private readonly billingTransactionRepository: Repository<BillingTransaction>,
  ) {}

  public getTransactionSubject(userId: number): Subject<{ data: BillingTransaction }> {
    if (!this.transactionSubjects.has(userId)) {
      this.transactionSubjects.set(userId, new Subject<{ data: BillingTransaction }>());
    }
    return this.transactionSubjects.get(userId);
  }

  public async notifyTransactionUpdate(transactionOrId: BillingTransaction | number): Promise<void> {
    const transactionId = typeof transactionOrId === 'number' ? transactionOrId : transactionOrId.id;

    const transaction = await this.billingTransactionRepository.findOne({
      where: { id: transactionId },
      relations: ['items'],
    });
    if (!transaction) {
      throw new BadRequestException('Transaction not found');
    }

    this.getTransactionSubject(transaction.userId).next({ data: transaction });
  }
}
