import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AppSettingsDto } from './dto/app-settings.dto';
import { SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SmtpSettingsInternal, SmtpSettingsService } from './smtp-settings.service';
import { APP_KEYS, APP_PARENT, METRICS_KEYS, METRICS_PARENT } from './constants';
import { SettingsStoreService } from './settings-store.service';
import {
  FirstTimeSetupStatusDto,
  FirstTimeSetupStepsDto,
} from './dto/first-time-setup-status.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly settingsStore: SettingsStoreService,
    private readonly smtpSettingsService: SmtpSettingsService,
  ) {}

  async isFirstTimeSetupAvailable(): Promise<boolean> {
    const count = await this.userRepository.count();
    return count === 0;
  }

  async getFirstTimeSetupStatus(): Promise<FirstTimeSetupStatusDto> {
    const [app, smtp, userCount] = await Promise.all([
      this.getAppSettings(),
      this.smtpSettingsService.getSettings(),
      this.userRepository.count(),
    ]);

    const stepsCompleted: FirstTimeSetupStepsDto = {
      app:
        !!app.url?.trim() &&
        app.licenseKeyConfigured === true,
      smtp:
        !!smtp.service &&
        !!smtp.user?.trim() &&
        !!smtp.from?.trim(),
      admin: userCount > 0,
    };

    return {
      available: userCount === 0,
      stepsCompleted,
    };
  }

  async getSystemSettings(): Promise<SystemSettingsDto> {
    const [app, smtp] = await Promise.all([this.getAppSettings(), this.smtpSettingsService.getSettings()]);
    return { app, smtp };
  }

  async updateSystemSettings(update: UpdateSystemSettingsDto): Promise<SystemSettingsDto> {
    if (update.app) {
      await this.updateAppSettings(update.app);
    }
    if (update.smtp) {
      await this.updateSmtpSettings(update.smtp);
    }
    return this.getSystemSettings();
  }

  async getAppSettings(): Promise<AppSettingsDto> {
    const [url, publicInternetUrl, licenseKey] = await Promise.all([
      this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.url),
      this.settingsStore.getPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl),
      this.settingsStore.getSecretSetting(APP_PARENT, APP_KEYS.licenseKey),
    ]);

    return {
      url,
      publicInternetUrl,
      licenseKeyConfigured: licenseKey.configured,
    };
  }

  async updateAppSettings(update: UpdateAppSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'url')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.url, update.url ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'publicInternetUrl')) {
      await this.settingsStore.setPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl, update.publicInternetUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'licenseKey')) {
      await this.settingsStore.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, update.licenseKey ?? null);
    }
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

  async getMetricsApiKey(): Promise<{ value: string | null; configured: boolean }> {
    return this.settingsStore.getSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey);
  }

  async setMetricsApiKey(apiKey: string | null): Promise<void> {
    await this.settingsStore.setSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey, apiKey);
  }

  async generateMetricsApiKey(): Promise<{ apiKey: string }> {
    const apiKey = randomBytes(32).toString('base64url');
    await this.settingsStore.setSecretSetting(METRICS_PARENT, METRICS_KEYS.apiKey, apiKey);
    return { apiKey };
  }
}
