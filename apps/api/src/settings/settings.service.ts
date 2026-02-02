import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Setting, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../config/app.config';
import { EncryptionService } from '../encryption/encryption.service';
import { AppSettingsDto } from './dto/app-settings.dto';
import { SmtpServiceType, SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

const APP_PARENT = 'app';
const SMTP_PARENT = 'smtp';

const APP_KEYS = {
  frontendUrl: 'frontend_url',
  backendUrl: 'backend_url',
  publicInternetUrl: 'public_internet_url',
  licenseKey: 'license_key',
} as const;

const SMTP_KEYS = {
  service: 'service',
  host: 'host',
  port: 'port',
  secure: 'secure',
  user: 'user',
  pass: 'pass',
  from: 'from',
} as const;

type SmtpSettingsInternal = {
  service: SmtpServiceType | null;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  user: string | null;
  pass: string | null;
  from: string | null;
  passConfigured: boolean;
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async isFirstTimeSetupAvailable(): Promise<boolean> {
    const count = await this.userRepository.count();
    return count === 0;
  }

  async getSystemSettings(): Promise<SystemSettingsDto> {
    const [app, smtp] = await Promise.all([this.getAppSettings(), this.getSmtpSettings()]);
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
    const appConfig = this.configService.get<AppConfigType>('app');
    const [frontendUrl, backendUrl, publicInternetUrl, licenseKey] = await Promise.all([
      this.getPlainSettingValue(
        APP_PARENT,
        APP_KEYS.frontendUrl,
        this.resolveFrontendUrl(appConfig),
        true,
      ),
      this.getPlainSettingValue(APP_PARENT, APP_KEYS.backendUrl, this.resolveBackendUrl(appConfig), true),
      this.getPlainSettingValue(
        APP_PARENT,
        APP_KEYS.publicInternetUrl,
        this.resolvePublicInternetUrl(appConfig),
        true,
      ),
      this.getSecretSettingValue(APP_PARENT, APP_KEYS.licenseKey, this.resolveLicenseKey(appConfig), true),
    ]);

    return {
      frontendUrl,
      backendUrl,
      publicInternetUrl,
      licenseKeyConfigured: licenseKey.configured,
    };
  }

  async updateAppSettings(update: UpdateAppSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'frontendUrl')) {
      await this.setPlainSetting(APP_PARENT, APP_KEYS.frontendUrl, update.frontendUrl);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'backendUrl')) {
      await this.setPlainSetting(APP_PARENT, APP_KEYS.backendUrl, update.backendUrl ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'publicInternetUrl')) {
      await this.setPlainSetting(APP_PARENT, APP_KEYS.publicInternetUrl, update.publicInternetUrl);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'licenseKey')) {
      await this.setSecretSetting(APP_PARENT, APP_KEYS.licenseKey, update.licenseKey ?? null);
    }
  }

  async getSmtpSettings(): Promise<SmtpSettingsDto> {
    const smtp = await this.getSmtpSettingsInternal();
    return {
      service: smtp.service,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      from: smtp.from,
      passConfigured: smtp.passConfigured,
    };
  }

  async updateSmtpSettings(update: UpdateSmtpSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'service')) {
      await this.setPlainSetting(SMTP_PARENT, SMTP_KEYS.service, update.service ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'host')) {
      await this.setPlainSetting(SMTP_PARENT, SMTP_KEYS.host, update.host ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'port')) {
      const portValue = update.port ?? null;
      await this.setPlainSetting(SMTP_PARENT, SMTP_KEYS.port, portValue === null ? null : String(portValue));
    }
    if (Object.prototype.hasOwnProperty.call(update, 'secure')) {
      const secureValue = update.secure ?? null;
      await this.setPlainSetting(SMTP_PARENT, SMTP_KEYS.secure, secureValue === null ? null : String(secureValue));
    }
    if (Object.prototype.hasOwnProperty.call(update, 'user')) {
      await this.setPlainSetting(SMTP_PARENT, SMTP_KEYS.user, update.user ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'pass')) {
      await this.setSecretSetting(SMTP_PARENT, SMTP_KEYS.pass, update.pass ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'from')) {
      await this.setPlainSetting(SMTP_PARENT, SMTP_KEYS.from, update.from ?? null);
    }
  }

  async getFrontendUrl(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    return this.getPlainSettingValue(APP_PARENT, APP_KEYS.frontendUrl, this.resolveFrontendUrl(appConfig), true);
  }

  async getBackendUrl(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    return this.getPlainSettingValue(APP_PARENT, APP_KEYS.backendUrl, this.resolveBackendUrl(appConfig), true);
  }

  async getPublicInternetUrl(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    return this.getPlainSettingValue(
      APP_PARENT,
      APP_KEYS.publicInternetUrl,
      this.resolvePublicInternetUrl(appConfig),
      true,
    );
  }

  async getLicenseKey(): Promise<string | null> {
    const appConfig = this.configService.get<AppConfigType>('app');
    const licenseKey = await this.getSecretSettingValue(APP_PARENT, APP_KEYS.licenseKey, this.resolveLicenseKey(appConfig), true);
    return licenseKey.value;
  }

  async getSmtpConfiguration(): Promise<SmtpSettingsInternal | null> {
    const smtp = await this.getSmtpSettingsInternal();
    if (!smtp.service) {
      return null;
    }

    if (smtp.service === SmtpServiceType.SMTP) {
      if (!smtp.host || !smtp.port || !smtp.from) {
        throw new BadRequestException('SMTP configuration is incomplete');
      }
    }

    if (smtp.service === SmtpServiceType.Outlook365) {
      if (!smtp.from) {
        throw new BadRequestException('SMTP configuration is incomplete');
      }
    }

    if (smtp.pass && !smtp.user) {
      throw new BadRequestException('SMTP configuration is incomplete');
    }

    return smtp;
  }

  private async getSmtpSettingsInternal(): Promise<SmtpSettingsInternal> {
    const serviceRaw = await this.getPlainSettingValue(
      SMTP_PARENT,
      SMTP_KEYS.service,
      this.resolveSmtpService(),
      true,
    );
    const service = this.normalizeSmtpService(serviceRaw);

    const [host, portRaw, secureRaw, user, from, pass] = await Promise.all([
      this.getPlainSettingValue(SMTP_PARENT, SMTP_KEYS.host, this.resolveSmtpHost(), true),
      this.getPlainSettingValue(SMTP_PARENT, SMTP_KEYS.port, this.resolveSmtpPort(), true),
      this.getPlainSettingValue(SMTP_PARENT, SMTP_KEYS.secure, this.resolveSmtpSecure(), true),
      this.getPlainSettingValue(SMTP_PARENT, SMTP_KEYS.user, this.resolveSmtpUser(), true),
      this.getPlainSettingValue(SMTP_PARENT, SMTP_KEYS.from, this.resolveSmtpFrom(), true),
      this.getSecretSettingValue(SMTP_PARENT, SMTP_KEYS.pass, this.resolveSmtpPass(), true),
    ]);

    return {
      service,
      host,
      port: this.parseNumber(portRaw),
      secure: this.parseBoolean(secureRaw),
      user,
      from,
      pass: pass.value,
      passConfigured: pass.configured,
    };
  }

  private normalizeSmtpService(value: string | null): SmtpServiceType | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim() as SmtpServiceType;
    return Object.values(SmtpServiceType).includes(normalized) ? normalized : null;
  }

  private parseBoolean(value: string | null): boolean | null {
    if (value === null) {
      return null;
    }
    const normalized = value.toString().trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    return null;
  }

  private parseNumber(value: string | null): number | null {
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async getPlainSettingValue(
    parent: string,
    key: string,
    fallback: string | null,
    persistFallback: boolean,
  ): Promise<string | null> {
    const existing = await this.settingRepository.findOneBy({ parent, key });
    if (existing?.value) {
      return existing.value;
    }

    const normalizedFallback = this.normalizeString(fallback);
    if (normalizedFallback && persistFallback) {
      await this.upsertSetting(parent, key, normalizedFallback);
    }

    return normalizedFallback ?? null;
  }

  private async getSecretSettingValue(
    parent: string,
    key: string,
    fallback: string | null,
    persistFallback: boolean,
  ): Promise<{ value: string | null; configured: boolean }> {
    const existing = await this.settingRepository.findOneBy({ parent, key });
    if (existing?.value) {
      try {
        const decrypted = this.encryptionService.decrypt(existing.value);
        return { value: decrypted, configured: true };
      } catch (error) {
        this.logger.warn(`Failed to decrypt setting ${parent}:${key}, falling back to raw value`, error as Error);
        return { value: existing.value, configured: true };
      }
    }

    const normalizedFallback = this.normalizeString(fallback);
    if (normalizedFallback) {
      if (persistFallback) {
        await this.upsertSetting(parent, key, this.encryptionService.encrypt(normalizedFallback));
      }
      return { value: normalizedFallback, configured: true };
    }

    return { value: null, configured: false };
  }

  private async setPlainSetting(parent: string, key: string, value: string | null): Promise<void> {
    const normalized = this.normalizeString(value);
    if (!normalized) {
      await this.settingRepository.delete({ parent, key });
      return;
    }
    await this.upsertSetting(parent, key, normalized);
  }

  private async setSecretSetting(parent: string, key: string, value: string | null): Promise<void> {
    const normalized = this.normalizeString(value);
    if (!normalized) {
      await this.settingRepository.delete({ parent, key });
      return;
    }
    const encrypted = this.encryptionService.encrypt(normalized);
    await this.upsertSetting(parent, key, encrypted);
  }

  private async upsertSetting(parent: string, key: string, value: string): Promise<void> {
    await this.settingRepository.upsert({ parent, key, value }, ['parent', 'key']);
  }

  private resolveFrontendUrl(appConfig?: AppConfigType): string | null {
    return (
      appConfig?.ATTRACCESS_FRONTEND_URL ??
      process.env.ATTRACCESS_FRONTEND_URL ??
      process.env.FRONTEND_URL ??
      process.env.ATTRACCESS_URL ??
      process.env.VITE_ATTRACCESS_URL ??
      null
    );
  }

  private resolveBackendUrl(appConfig?: AppConfigType): string | null {
    return appConfig?.ATTRACCESS_URL ?? process.env.ATTRACCESS_URL ?? process.env.VITE_ATTRACCESS_URL ?? null;
  }

  private resolvePublicInternetUrl(appConfig?: AppConfigType): string | null {
    return (
      appConfig?.ATTRACCESS_PUBLIC_INTERNET_URL ??
      process.env.ATTRACCESS_PUBLIC_INTERNET_URL ??
      this.resolveBackendUrl(appConfig)
    );
  }

  private resolveLicenseKey(appConfig?: AppConfigType): string | null {
    return appConfig?.LICENSE_KEY ?? process.env.LICENSE_KEY ?? null;
  }

  private resolveSmtpService(): string | null {
    return process.env.SMTP_SERVICE ?? null;
  }

  private resolveSmtpHost(): string | null {
    return process.env.SMTP_HOST ?? null;
  }

  private resolveSmtpPort(): string | null {
    return process.env.SMTP_PORT ?? null;
  }

  private resolveSmtpSecure(): string | null {
    return process.env.SMTP_SECURE ?? null;
  }

  private resolveSmtpUser(): string | null {
    return process.env.SMTP_USER ?? null;
  }

  private resolveSmtpPass(): string | null {
    return process.env.SMTP_PASS ?? null;
  }

  private resolveSmtpFrom(): string | null {
    return process.env.SMTP_FROM ?? null;
  }
}
