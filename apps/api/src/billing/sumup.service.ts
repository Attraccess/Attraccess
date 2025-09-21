import { BillingTransaction, Setting, BillingTransactionStatus } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { SumUp } from '@sumup/sdk';
import { EncryptionService } from '../encryption/encryption.service';
import { SumUpMerchantDto } from './dto/sumup/sumup-merchant.dto';
import { SumUpReaderDto } from './dto/sumup/sumup-reader.dto';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../config/app.config';
import { SumupTransactionCallbackDto, SumupTransactionEventType } from './dto/sumup/sumup-transaction-callback.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LiveNotificationsService } from './liveNotificationsService';
import { BillingService } from './billing.service';

export const SUMUP_TOPUP_TRANSACTION_PREFIX = 'sumup_topup_transaction';

@Injectable()
export class SumUpService {
  private readonly logger = new Logger(SumUpService.name);
  private readonly appConfig: AppConfigType;

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    @InjectRepository(BillingTransaction)
    private readonly billingTransactionRepository: Repository<BillingTransaction>,
    private readonly liveNotificationsService: LiveNotificationsService,
    private readonly billingService: BillingService,
  ) {
    this.appConfig = this.configService.get<AppConfigType>('app');
  }

  async setApiKey(token: string): Promise<void> {
    const sumUp = new SumUp({ apiKey: token });
    try {
      await sumUp.merchant.get();
    } catch (error) {
      this.logger.error('Invalid API key', { error });
      throw new BadRequestException('Invalid API key');
    }

    const encryptedApiKey = this.encryptionService.encrypt(token);

    const existingApiKeyInDb = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'apiKey' });
    if (existingApiKeyInDb) {
      await this.settingRepository.update(existingApiKeyInDb.id, { value: encryptedApiKey });
    } else {
      await this.settingRepository.insert({ parent: 'sumup', key: 'apiKey', value: encryptedApiKey });
    }
  }

  async getIsEnabled(): Promise<boolean> {
    const apiKey = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'apiKey' });

    if (!apiKey) {
      return false;
    }

    try {
      this.encryptionService.decrypt(apiKey.value);
      return true;
    } catch {
      return false;
    }
  }

  private async getSumUp(): Promise<SumUp> {
    const apiKeySetting = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'apiKey' });
    const apiKeyEncrypted = apiKeySetting?.value;
    if (!apiKeyEncrypted) {
      throw new BadRequestException('SumUp API key not found');
    }

    const apiKey = this.encryptionService.decrypt(apiKeyEncrypted);
    return new SumUp({ apiKey });
  }

  async getMerchant(): Promise<SumUpMerchantDto> {
    const sumUp = await this.getSumUp();
    return await sumUp.merchant.get();
  }

  async getReaders(): Promise<SumUpReaderDto[]> {
    const sumUp = await this.getSumUp();
    const merchant = await sumUp.merchant.get();
    const response = await sumUp.readers.list(merchant.merchant_profile.merchant_code);
    return response.items;
  }

  async pairReader(pairingCode: string, name: string): Promise<SumUpReaderDto> {
    const sumUp = await this.getSumUp();

    const merchant = await sumUp.merchant.get();
    const merchantCode = merchant.merchant_profile.merchant_code;

    try {
      return await sumUp.readers.create(merchantCode, { pairing_code: pairingCode.toUpperCase(), name });
    } catch (error) {
      this.logger.error('Failed to pair reader', { error });
      throw new BadRequestException(error.error?.message ?? error.message ?? 'Failed to pair reader');
    }
  }

  async removeReader(readerId: string): Promise<void> {
    const sumUp = await this.getSumUp();

    const merchant = await sumUp.merchant.get();
    const merchantCode = merchant.merchant_profile.merchant_code;

    try {
      await sumUp.readers.deleteReader(merchantCode, readerId);
    } catch (error) {
      if (error.message.includes('SumUpError: Unexpected non-json response')) {
        return;
      }

      throw error;
    }
  }

  async topUpWithReader(userId: number, readerId: string, amount: number): Promise<BillingTransaction> {
    if (amount % 1 !== 0) {
      throw new BadRequestException('Amount must be an integer (multiply by currency minor unit)');
    }

    const { currency, minorUnit } = await this.billingService.getConfiguration();

    const sumUp = await this.getSumUp();
    const merchant = await sumUp.merchant.get();
    const merchantCode = merchant.merchant_profile.merchant_code;

    let returnUrl: string;
    if (this.appConfig.ATTRACCESS_URL.startsWith('https://')) {
      returnUrl = this.appConfig.ATTRACCESS_URL + '/api/billing/top-up/sumup/callback';
      this.logger.debug('setting returl_url for sumup checkout', { returnUrl });
    }

    try {
      const checkout = await sumUp.readers.createCheckout(merchantCode, readerId, {
        description: 'Attraccess Top-up',
        total_amount: {
          currency,
          value: amount,
          minor_unit: minorUnit,
        },
        return_url: returnUrl,
      });

      const transaction = await this.billingTransactionRepository.save({
        userId,
        amount: amount,
        externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:${checkout.data.client_transaction_id}`,
        status: BillingTransactionStatus.Pending,
      });

      this.liveNotificationsService.notifyTransactionUpdate(transaction);

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

  private async updateTransactionStatusBySumupServer(sumupTransactionId: string): Promise<void> {
    const transaction = await this.billingTransactionRepository.findOneBy({
      externalReference: `sumup_topup_transaction:${sumupTransactionId}`,
    });

    if (!transaction) {
      this.logger.error(`updateTransactionStatusBySumupServer: Sumup transaction not found, ${sumupTransactionId}`);
      throw new BadRequestException('Sumup transaction not found');
    }

    const sumup = await this.getSumUp();
    const merchant = await sumup.merchant.get();
    const merchantCode = merchant.merchant_profile.merchant_code;
    const sumUpTransactionData = await sumup.transactions.get(merchantCode, {
      client_transaction_id: sumupTransactionId,
    });

    switch (sumUpTransactionData.status) {
      case 'CANCELLED':
        transaction.status = BillingTransactionStatus.Failed;
        break;

      case 'FAILED':
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

    this.logger.debug(
      `updateTransactionStatusBySumupServer: Updating transaction status of ${sumupTransactionId} to ${transaction.status}`,
    );
    const updatedTransaction = await this.billingTransactionRepository.save(transaction);
    this.liveNotificationsService.notifyTransactionUpdate(updatedTransaction);

    this.logger.debug(
      `updateTransactionStatusBySumupServer: Transaction status updated of ${sumupTransactionId} to ${transaction.status}`,
    );
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingTransactions(): Promise<void> {
    this.logger.debug('processPendingTransactions: starting');

    const transactions = await this.billingTransactionRepository.findBy({
      status: BillingTransactionStatus.Pending,
    });

    this.logger.debug(`processPendingTransactions: found ${transactions.length} pending transactions`);

    for (const transaction of transactions) {
      if (!transaction.externalReference.startsWith(SUMUP_TOPUP_TRANSACTION_PREFIX)) {
        this.logger.debug('processPendingTransactions: skipping non-sumup transaction', {
          transactionId: transaction.externalReference,
        });
        continue;
      }

      const transactionId = transaction.externalReference.split(':')[1];
      if (!transactionId) {
        this.logger.error(`Stored sumup transaction ID is invalid, ${transaction.externalReference}`);
        transaction.status = BillingTransactionStatus.Failed;
        const updatedTransaction = await this.billingTransactionRepository.save(transaction);
        this.liveNotificationsService.notifyTransactionUpdate(updatedTransaction);
        continue;
      }

      await this.updateTransactionStatusBySumupServer(transactionId);
    }

    this.logger.debug('processPendingTransactions: finished');
  }
}
