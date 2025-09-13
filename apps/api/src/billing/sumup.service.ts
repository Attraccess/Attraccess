import { BillingTransaction, Setting, User, BillingTransactionStatus } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { SumUpConfigurationDto } from './dto/sumup/sumup-configuration.dto';
import { SumUp } from '@sumup/sdk';
import { EncryptionService } from '../encryption/encryption.service';
import { SumUpMerchantDto } from './dto/sumup/sumup-merchant.dto';
import { SumUpReaderDto } from './dto/sumup/sumup-reader.dto';
import { Currency, SetSumUpConfigurationDto } from './dto/sumup/set-sumup-configuration.dto';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../config/app.config';
import { SumupTransactionCallbackDto, SumupTransactionEventType } from './dto/sumup/sumup-transaction-callback.dto';

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

  async setConfiguration(nextConfigurationData: SetSumUpConfigurationDto): Promise<SumUpConfigurationDto> {
    if (nextConfigurationData.currencyToCreditsRate <= 0) {
      throw new BadRequestException('Currency to credits rate must be greater than 0');
    }

    if (!Object.values(Currency).includes(nextConfigurationData.currency)) {
      throw new BadRequestException('Invalid currency');
    }

    await this.settingRepository.manager.transaction(async (transactionalEntityManager) => {
      const existingCurrency = await transactionalEntityManager.findOneBy(Setting, {
        parent: 'sumup',
        key: 'currency',
      });
      const existingCurrencyToCreditsRate = await transactionalEntityManager.findOneBy(Setting, {
        parent: 'sumup',
        key: 'currencyToCreditsRate',
      });

      if (nextConfigurationData.adjustExistingBalances) {
        const currentCurrencyToCreditsRate = existingCurrencyToCreditsRate
          ? Number(existingCurrencyToCreditsRate.value)
          : 100;

        const factor = nextConfigurationData.currencyToCreditsRate / currentCurrencyToCreditsRate;

        await transactionalEntityManager
          .createQueryBuilder()
          .update(User)
          .set({
            creditBalance: () => `creditBalance * ${factor}`,
          })
          .execute();
      }

      if (existingCurrency) {
        await transactionalEntityManager.update(Setting, existingCurrency.id, {
          value: nextConfigurationData.currency,
        });
      } else {
        await transactionalEntityManager.insert(Setting, {
          parent: 'sumup',
          key: 'currency',
          value: nextConfigurationData.currency,
        });
      }

      if (existingCurrencyToCreditsRate) {
        await transactionalEntityManager.update(Setting, existingCurrencyToCreditsRate.id, {
          value: nextConfigurationData.currencyToCreditsRate.toString(),
        });
      } else {
        await transactionalEntityManager.insert(Setting, {
          parent: 'sumup',
          key: 'currencyToCreditsRate',
          value: nextConfigurationData.currencyToCreditsRate.toString(),
        });
      }
    });

    return await this.getConfiguration();
  }

  async getConfiguration(): Promise<SumUpConfigurationDto> {
    const apiKey = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'apiKey' });

    if (!apiKey) {
      return {
        enabled: false,
        currency: Currency.EUR,
        currencyToCreditsRate: 100,
      };
    }

    let isEnabled = false;
    if (apiKey) {
      try {
        this.encryptionService.decrypt(apiKey.value);
        isEnabled = true;
      } catch {
        // nothing to do
      }
    }

    const currency = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'currency' });
    const currencyToCreditsRate = await this.settingRepository.findOneBy({
      parent: 'sumup',
      key: 'currencyToCreditsRate',
    });

    let currencyToCreditsRateValue = 100;
    if (currencyToCreditsRate) {
      currencyToCreditsRateValue = Number(currencyToCreditsRate.value);
      if (isNaN(currencyToCreditsRateValue)) {
        currencyToCreditsRateValue = 100;
      }
    }

    let currencyValue = Currency.EUR;
    if (currency) {
      currencyValue = (currency.value as Currency) ?? Currency.EUR;
    }

    return {
      enabled: isEnabled,
      currency: currencyValue,
      currencyToCreditsRate: currencyToCreditsRateValue,
    };
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

  async topUpWithReader(userId: number, readerId: string, tokenCount: number): Promise<BillingTransaction> {
    const currencyToCreditsRate = await this.settingRepository.findOneBy({
      parent: 'sumup',
      key: 'currencyToCreditsRate',
    });
    let currencyToCreditsRateValue = Number(currencyToCreditsRate?.value);
    if (isNaN(currencyToCreditsRateValue)) {
      currencyToCreditsRateValue = 100;
    }

    const currency = await this.settingRepository.findOneBy({
      parent: 'sumup',
      key: 'currency',
    });
    let currencyValue = Currency.EUR;
    if (currency) {
      currencyValue = (currency.value as Currency) ?? Currency.EUR;
    }

    let minorUnit: number;
    switch (currencyValue) {
      case Currency.EUR:
        minorUnit = 2;
        break;

      default:
        throw new BadRequestException('Unsupported currency');
    }

    const currencyAmount = tokenCount * currencyToCreditsRateValue;

    const sumUp = await this.getSumUp();
    const merchant = await sumUp.merchant.get();
    const merchantCode = merchant.merchant_profile.merchant_code;
    const checkout = await sumUp.readers.createCheckout(merchantCode, readerId, {
      description: 'Attraccess Top-up',
      total_amount: {
        currency: 'EUR',
        value: currencyAmount,
        minor_unit: minorUnit,
      },
      return_url: this.appConfig.ATTRACCESS_URL + '/api/billing/sumup/top-up/callback',
    });

    return await this.billingTransactionRepository.save({
      userId,
      amount: tokenCount,
      externalReference: `${SUMUP_TOPUP_TRANSACTION_PREFIX}:${checkout.data.client_transaction_id}`,
      status: BillingTransactionStatus.Pending,
    });
  }

  async handleTransactionCallback(data: DeepPartial<SumupTransactionCallbackDto>): Promise<void> {
    if (data.event_type !== SumupTransactionEventType.SoloTransactionUpdated) {
      this.logger.warn('Received unknown sumup webhook event', { eventType: data.event_type, fullEvent: data });
      return;
    }

    const transactionId = data.payload?.transaction_id;
    if (!transactionId) {
      this.logger.warn('Received sumup webhook event with no transaction id', { fullEvent: data });
      return;
    }

    const transaction = await this.billingTransactionRepository.findOneBy({
      externalReference: `sumup_topup_transaction:${transactionId}`,
    });
    if (!transaction) {
      this.logger.warn('Received sumup webhook event for unknown transaction', { transactionId, fullEvent: data });
      return;
    }

    const sumup = await this.getSumUp();
    const merchant = await sumup.merchant.get();
    const merchantCode = merchant.merchant_profile.merchant_code;
    const sumUpTransactionData = await sumup.transactions.get(merchantCode, { client_transaction_id: transactionId });

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

      default:
        this.logger.warn('Received sumup webhook event for unknown transaction status', {
          transactionId,
          fullEvent: data,
        });
        return;
    }

    await this.billingTransactionRepository.save(transaction);
  }
}
