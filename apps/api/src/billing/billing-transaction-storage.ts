import { BillingTransaction, BillingTransactionStatus, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { PaginationOptions } from '../types/request';
import { BillingConfigurationImplementation } from './billing-configuration';
import { RefundTransactionDto } from './dto/refund-transaction.dto';
import { TransactionsDto } from './dto/transactions.dto';
import { BillingTransactionNotFoundException } from './errors/billing-transaction-not-found.error';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { RefundAmountHigherThanTransactionAmountException } from './errors/refund-amount-higher-than-transaction-amount.error';
export abstract class BillingTransactionStorageImplementation extends BillingConfigurationImplementation {
  async getBalance(userId: number, transactionalEntityManager?: EntityManager): Promise<number> {
    const userRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(User)
      : this.userRepository;

    const user = await userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    return user.creditBalance;
  }

  async getTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    const transaction = await this.billingTransactionRepository.findOne({
      where: { resourceUsageId: usageId, userId },
      select: ['id'],
    });
    return transaction?.id ?? null;
  }

  async getHistory(userId: number, options: PaginationOptions): Promise<TransactionsDto> {
    const { page, limit } = options;

    const [transactions, total] = await this.billingTransactionRepository.findAndCount({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      relations: this.DEFAULT_RELATIONS,
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      data: transactions,
      total,
      page,
      limit,
    };
  }

  async getTransaction(transactionId: number, userId?: number): Promise<BillingTransaction> {
    return await this.billingTransactionRepository.findOne({
      where: { id: transactionId, userId },
      relations: this.DEFAULT_RELATIONS,
    });
  }

  async getResourceUsageCharge(resourceUsageId: number, userId: number): Promise<BillingTransaction | null> {
    return this.billingTransactionRepository.findOneBy({
      resourceUsageId,
      userId,
      status: BillingTransactionStatus.Completed,
    });
  }

  async createManualTransaction(
    userId: number,
    initiatorId: number,
    amount: number,
    failOnInsufficientBalance = true,
  ): Promise<BillingTransaction> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    if (amount % 1 !== 0) {
      throw new BadRequestException('Amount must be an integer (multiply by currency minor unit)');
    }

    const currentBalance = user.creditBalance;

    const amountIsNegative = amount < 0;

    if (amountIsNegative && failOnInsufficientBalance && currentBalance + amount < 0) {
      throw new InsufficientBalanceError();
    }

    const transaction = await this.billingTransactionRepository.save({
      userId,
      initiatorId,
      amount,
      status: BillingTransactionStatus.Completed,
    });

    this.liveNotificationsService.notifyTransactionUpdate(transaction);
    void this.auditService.recordBillingTransaction({
      transactionId: transaction.id,
      userId,
      initiatorId,
      amount,
      status: BillingTransactionStatus.Completed,
      source: 'manual',
    });
    this.metricsService.billingTransactionsTotal.inc({ status: transaction.status });
    if (amount) {
      this.metricsService.billingTransactionAmount.observe(Math.abs(amount));
    }

    return transaction;
  }

  public async refundTransaction(executingUserId: number, transactionId: number, data: RefundTransactionDto) {
    const transaction = await this.getTransaction(transactionId);

    if (!transaction) {
      throw new BillingTransactionNotFoundException();
    }

    if (data.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (data.amount > Math.abs(transaction.amount)) {
      throw new RefundAmountHigherThanTransactionAmountException();
    }

    const refundAmount = transaction.amount > 0 ? -data.amount : data.amount;

    const refundTransaction = await this.billingTransactionRepository.save({
      userId: transaction.userId,
      initiatorId: executingUserId,
      amount: refundAmount,
      status: BillingTransactionStatus.Completed,
      refundOfId: transaction.id,
    } as Partial<BillingTransaction>);

    this.liveNotificationsService.notifyTransactionUpdate(refundTransaction);
    void this.auditService.recordBillingTransaction({
      transactionId: refundTransaction.id,
      userId: refundTransaction.userId,
      initiatorId: executingUserId,
      amount: refundTransaction.amount,
      status: refundTransaction.status,
      source: 'refund',
    });

    return await this.getTransaction(refundTransaction.id);
  }
}
