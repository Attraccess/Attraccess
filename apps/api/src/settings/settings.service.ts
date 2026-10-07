import { User } from '@attraccess/database-entities';
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Repository } from 'typeorm';
import { auditSettingsUpdateSchema, readAuditSettings } from '../audit/audit.config';
import { APP_KEYS, APP_PARENT } from './constants';
import { SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { METRICS_TOGGLE_INVALIDATOR, MetricsToggleInvalidator } from './metrics-toggle-invalidator.token';
import { SettingsFirstTimeSetupImplementation } from './settings-first-time-setup';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsInternal, SmtpSettingsService } from './smtp-settings.service';

@Injectable()
export class SettingsService extends SettingsFirstTimeSetupImplementation {
  getAuditSettings() {
    return readAuditSettings(this.settingsStore);
  }

  async updateAuditSettings(update: unknown) {
    const parsed = auditSettingsUpdateSchema.safeParse(update);
    if (!parsed.success) throw new BadRequestException('Invalid audit settings');
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) await this.settingsStore.setPlainSetting('audit', key, JSON.stringify(value));
    }
    return this.getAuditSettings();
  }

  constructor(
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    protected readonly settingsStore: SettingsStoreService,
    protected readonly smtpSettingsService: SmtpSettingsService,
    @Optional()
    @Inject(METRICS_TOGGLE_INVALIDATOR)
    protected readonly metricsToggleInvalidator: MetricsToggleInvalidator | null = null,
  ) {
    super();
  }

  async getSmtpSettings(): Promise<SmtpSettingsDto> {
    return this.smtpSettingsService.getSettings();
  }

  async updateSmtpSettings(update: UpdateSmtpSettingsDto): Promise<void> {
    return this.smtpSettingsService.updateSettings(update);
  }

  async getUrl(): Promise<string | null> {
    return this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.url);
  }

  async getPublicInternetUrl(): Promise<string | null> {
    return this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl);
  }

  async getLicenseKey(): Promise<string | null> {
    const licenseKey = await this.settingsStore.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey);
    return licenseKey.value;
  }

  async getSmtpConfiguration(): Promise<SmtpSettingsInternal | null> {
    return this.smtpSettingsService.getConfiguration();
  }

  buildSmtpTransportOptions(config: SmtpSettingsInternal): SMTPTransport.Options {
    return this.smtpSettingsService.buildTransportOptions(config);
  }
}
