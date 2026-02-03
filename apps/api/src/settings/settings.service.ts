import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { AppSettingsDto } from './dto/app-settings.dto';
import { SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { AppSettingsService } from './app-settings.service';
import { SmtpSettingsInternal, SmtpSettingsService } from './smtp-settings.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly appSettingsService: AppSettingsService,
    private readonly smtpSettingsService: SmtpSettingsService,
  ) {}

  async isFirstTimeSetupAvailable(): Promise<boolean> {
    const count = await this.userRepository.count();
    return count === 0;
  }

  async getSystemSettings(): Promise<SystemSettingsDto> {
    const [app, smtp] = await Promise.all([this.appSettingsService.getSettings(), this.smtpSettingsService.getSettings()]);
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
    return this.appSettingsService.getSettings();
  }

  async updateAppSettings(update: UpdateAppSettingsDto): Promise<void> {
    return this.appSettingsService.updateSettings(update);
  }

  async getSmtpSettings(): Promise<SmtpSettingsDto> {
    return this.smtpSettingsService.getSettings();
  }

  async updateSmtpSettings(update: UpdateSmtpSettingsDto): Promise<void> {
    return this.smtpSettingsService.updateSettings(update);
  }

  async getFrontendUrl(): Promise<string | null> {
    return this.appSettingsService.getFrontendUrl();
  }

  async getBackendUrl(): Promise<string | null> {
    return this.appSettingsService.getBackendUrl();
  }

  async getPublicInternetUrl(): Promise<string | null> {
    return this.appSettingsService.getPublicInternetUrl();
  }

  async getLicenseKey(): Promise<string | null> {
    return this.appSettingsService.getLicenseKey();
  }

  async getSmtpConfiguration(): Promise<SmtpSettingsInternal | null> {
    return this.smtpSettingsService.getConfiguration();
  }
}
