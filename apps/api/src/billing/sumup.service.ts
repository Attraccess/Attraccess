// SumUp payment integration service for billing and reader management
// FEATURE: Billing SumUp integration

import { BillingTransaction, Setting } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SumUp } from '@sumup/sdk';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { CronTimer } from '../metrics/instrumentation/cron/cron.helper';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { SettingsService } from '../settings/settings.service';
import { BillingService } from './billing.service';
import { SumUpMerchantDto } from './dto/sumup/sumup-merchant.dto';
import { SumUpReaderDto } from './dto/sumup/sumup-reader.dto';
import { LiveNotificationsService } from './liveNotificationsService';
import { SumupPaymentProcessingImplementation } from './sumup-payment-processing';

@Injectable()
export class SumUpService extends SumupPaymentProcessingImplementation {
  protected readonly logger = new Logger(SumUpService.name);
  protected hasPendingTransactions = true;

  constructor(
    @InjectRepository(Setting)
    protected readonly settingRepository: Repository<Setting>,
    protected readonly encryptionService: EncryptionService,
    protected readonly settingsService: SettingsService,
    @InjectRepository(BillingTransaction)
    protected readonly billingTransactionRepository: Repository<BillingTransaction>,
    protected readonly liveNotificationsService: LiveNotificationsService,
    protected readonly billingService: BillingService,
    protected readonly cronTimer: CronTimer,
    protected readonly externalCallTimer: ExternalCallTimer,
    protected readonly auditService: AuditService,
  ) {
    super();
  }

  async setApiKey(token: string): Promise<void> {
    const sumUp = new SumUp({ apiKey: token });
    const me = await this.externalCallTimer
      .time('sumup', 'me', () => sumUp.get<{ merchant_profile?: { merchant_code?: string } }>({ path: '/v0.1/me' }))
      .catch((error) => {
        this.logger.error('Invalid API key', { error });
        throw new BadRequestException('Invalid API key');
      });

    // /v0.1/me nests the code under merchant_profile, it is not a top-level field
    const merchantCode = me.merchant_profile?.merchant_code;
    if (!merchantCode) {
      this.logger.error('SumUp /v0.1/me returned no merchant_profile.merchant_code');
      throw new BadRequestException('SumUp returned no merchant code for this API key');
    }

    const encryptedApiKey = this.encryptionService.encrypt(token);

    const existingApiKey = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'apiKey' });
    if (existingApiKey) {
      await this.settingRepository.update(existingApiKey.id, { value: encryptedApiKey });
    } else {
      await this.settingRepository.insert({ parent: 'sumup', key: 'apiKey', value: encryptedApiKey });
    }

    const existingMerchantCode = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'merchantCode' });
    if (existingMerchantCode) {
      await this.settingRepository.update(existingMerchantCode.id, { value: merchantCode });
    } else {
      await this.settingRepository.insert({ parent: 'sumup', key: 'merchantCode', value: merchantCode });
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

  protected async getSumUp(): Promise<SumUp> {
    const apiKeySetting = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'apiKey' });
    const apiKeyEncrypted = apiKeySetting?.value;
    if (!apiKeyEncrypted) {
      throw new BadRequestException('SumUp API key not found');
    }

    const apiKey = this.encryptionService.decrypt(apiKeyEncrypted);
    return new SumUp({ apiKey });
  }

  protected async getMerchantCode(): Promise<string> {
    const setting = await this.settingRepository.findOneBy({ parent: 'sumup', key: 'merchantCode' });
    if (!setting?.value) {
      throw new BadRequestException('SumUp merchant code not found');
    }
    return setting.value;
  }

  async getMerchant(): Promise<SumUpMerchantDto> {
    const sumUp = await this.getSumUp();
    const merchantCode = await this.getMerchantCode();
    return (await this.externalCallTimer.time('sumup', 'merchant', () =>
      sumUp.merchants.get(merchantCode),
    )) as unknown as SumUpMerchantDto;
  }

  async getReaders(): Promise<SumUpReaderDto[]> {
    const sumUp = await this.getSumUp();
    const merchantCode = await this.getMerchantCode();
    const response = await this.externalCallTimer.time('sumup', 'readers_list', () => sumUp.readers.list(merchantCode));
    return response.items as unknown as SumUpReaderDto[];
  }

  async pairReader(pairingCode: string, name: string): Promise<SumUpReaderDto> {
    const sumUp = await this.getSumUp();
    const merchantCode = await this.getMerchantCode();

    try {
      return (await this.externalCallTimer.time('sumup', 'readers_create', () =>
        sumUp.readers.create(merchantCode, { pairing_code: pairingCode.toUpperCase(), name }),
      )) as unknown as SumUpReaderDto;
    } catch (error) {
      this.logger.error('Failed to pair reader', { error });
      throw new BadRequestException(error.error?.message ?? error.message ?? 'Failed to pair reader');
    }
  }

  async removeReader(readerId: string): Promise<void> {
    const sumUp = await this.getSumUp();
    const merchantCode = await this.getMerchantCode();

    await this.externalCallTimer.time('sumup', 'readers_delete', async () => {
      try {
        return await sumUp.readers.delete(merchantCode, readerId);
      } catch (error) {
        if (error instanceof Error && error.message.includes('SumUpError: Unexpected non-json response')) {
          return;
        }
        throw error;
      }
    });
  }
}

export { SUMUP_TOPUP_TRANSACTION_PREFIX } from './sumup.service.route-context';
