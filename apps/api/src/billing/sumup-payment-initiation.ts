import { BillingTransaction, BillingTransactionStatus } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';
import { SumupTransactionCallbackDto, SumupTransactionEventType } from './dto/sumup/sumup-transaction-callback.dto';
import { SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service.route-context';
import { SumUpServiceRouteContext } from './sumup.service.route-context';
export abstract class SumupPaymentInitiationImplementation extends SumUpServiceRouteContext {
  async topUpWithReader(userId: number, readerId: string, amount: number): Promise<BillingTransaction> {
    if (amount % 1 !== 0) {
      throw new BadRequestException('Amount must be an integer (multiply by currency minor unit)');
    }

    const { currency, minorUnit } = await this.billingService.getConfiguration();

    const sumUp = await this.getSumUp();
    const merchantCode = await this.getMerchantCode();

    let returnUrl: string | undefined;
    const publicInternetUrl = await this.settingsService.getPublicInternetUrl();
    if (publicInternetUrl?.startsWith('https://')) {
      returnUrl = publicInternetUrl + '/api/billing/top-up/sumup/callback';
      this.logger.debug('setting returl_url for sumup checkout', { returnUrl });
    }

    try {
      const checkout = await this.externalCallTimer.time('sumup', 'checkout', () =>
        sumUp.readers.createCheckout(merchantCode, readerId, {
          description: 'Attraccess Top-up',
          total_amount: {
            currency,
            value: amount,
            minor_unit: minorUnit,
          },
          ...(returnUrl ? { return_url: returnUrl } : {}),
        }),
      );

      const transaction = await this.billingTransactionRepository.save({
        userId,
        amount: amount,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:${checkout.data.client_transaction_id}`,
        status: BillingTransactionStatus.Pending,
      });
      this.hasPendingTransactions = true;

      this.liveNotificationsService.notifyTransactionUpdate(transaction);
      void this.auditService.recordBillingTransaction({
        transactionId: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        status: transaction.status,
        source: 'sumup-topup',
      });

      return transaction;
    } catch (error) {
      if (error.error.errors.detail === 'Not Found' && error.status === 404) {
        throw new BadRequestException('READER_NOT_FOUND');
      }

      throw error;
    }
  }

  async handleTransactionCallback(data: DeepPartial<SumupTransactionCallbackDto>): Promise<void> {
    if (data.event_type !== SumupTransactionEventType.SoloTransactionUpdated) {
      this.logger.warn('Received unknown sumup webhook event', { eventType: data.event_type, fullEvent: data });
      return;
    }

    const transactionId = data.payload?.client_transaction_id;
    if (!transactionId) {
      this.logger.warn('Received sumup webhook event with no transaction id', { fullEvent: data });
      return;
    }

    await this.updateTransactionStatusBySumupServer(transactionId);
  }
}
