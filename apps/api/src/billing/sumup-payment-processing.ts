import { BillingTransactionStatus } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SumupPaymentInitiationImplementation } from './sumup-payment-initiation';
import { SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service.route-context';
export abstract class SumupPaymentProcessingImplementation extends SumupPaymentInitiationImplementation {
  protected async updateTransactionStatusBySumupServer(sumupTransactionId: string): Promise<void> {
    const transaction = await this.billingTransactionRepository.findOneBy({
      externalReference: `sumup_topup_transaction:${sumupTransactionId}`,
    });

    if (!transaction) {
      this.logger.error(`updateTransactionStatusBySumupServer: Sumup transaction not found, ${sumupTransactionId}`);
      throw new BadRequestException('Sumup transaction not found');
    }

    const sumup = await this.getSumUp();
    const merchantCode = await this.getMerchantCode();
    const sumUpTransactionData = await this.externalCallTimer.time('sumup', 'transactions', () =>
      sumup.transactions.get(merchantCode, {
        client_transaction_id: sumupTransactionId,
      }),
    );

    const previousStatus = transaction.status;
    switch (sumUpTransactionData.status) {
      case 'CANCELLED':
      case 'FAILED':
      case 'REFUNDED':
        transaction.status = BillingTransactionStatus.Failed;
        break;

      case 'PENDING':
        transaction.status = BillingTransactionStatus.Pending;
        break;

      case 'SUCCESSFUL':
        transaction.status = BillingTransactionStatus.Completed;
        break;

      default: {
        const exhaustiveCheck: never = sumUpTransactionData.status;
        throw new Error(`Unknown sumup transaction status: ${exhaustiveCheck}`);
      }
    }

    if (transaction.status === previousStatus) return;

    this.logger.debug(
      `updateTransactionStatusBySumupServer: Updating transaction status of ${sumupTransactionId} to ${transaction.status}`,
    );
    const updatedTransaction = await this.billingTransactionRepository.save(transaction);
    this.hasPendingTransactions = true;
    this.liveNotificationsService.notifyTransactionUpdate(updatedTransaction);
    void this.auditService.recordBillingTransaction({
      transactionId: updatedTransaction.id,
      userId: updatedTransaction.userId,
      amount: updatedTransaction.amount,
      status: updatedTransaction.status,
      previousStatus,
      source: 'sumup-topup',
    });

    this.logger.debug(
      `updateTransactionStatusBySumupServer: Transaction status updated of ${sumupTransactionId} to ${transaction.status}`,
    );
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingTransactions(): Promise<void> {
    await this.cronTimer.time('sumup_poll', async () => {
      if (!this.hasPendingTransactions) {
        return;
      }

      this.logger.debug('processPendingTransactions: starting');

      const transactions = await this.billingTransactionRepository.findBy({
        status: BillingTransactionStatus.Pending,
      });

      this.logger.debug(`processPendingTransactions: found ${transactions.length} pending transactions`);

      const consideredTransactions = transactions.filter((transaction) =>
        transaction.externalReference?.startsWith(SUMUP_TOPUP_TRANSACTION_PREFIX),
      );

      this.hasPendingTransactions = consideredTransactions.length > 0;

      for (const transaction of consideredTransactions) {
        const transactionId = transaction.externalReference.split(':')[1];
        if (!transactionId) {
          this.logger.error(`Stored sumup transaction ID is invalid, ${transaction.externalReference}`);
          transaction.status = BillingTransactionStatus.Failed;
          const updatedTransaction = await this.billingTransactionRepository.save(transaction);
          this.liveNotificationsService.notifyTransactionUpdate(updatedTransaction);
          void this.auditService.recordBillingTransaction({
            transactionId: updatedTransaction.id,
            userId: updatedTransaction.userId,
            amount: updatedTransaction.amount,
            status: updatedTransaction.status,
            previousStatus: BillingTransactionStatus.Pending,
            source: 'sumup-topup',
          });
          continue;
        }

        await this.updateTransactionStatusBySumupServer(transactionId);
      }

      this.logger.debug('processPendingTransactions: finished');
    });
  }
}
