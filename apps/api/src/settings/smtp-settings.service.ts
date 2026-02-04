import { BadRequestException, Injectable } from '@nestjs/common';
import { SmtpServiceType, SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SettingsStoreService } from './settings-store.service';
import { SMTP_KEYS, SMTP_PARENT } from './constants';

export type SmtpSettingsInternal = {
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
export class SmtpSettingsService {
  constructor(private readonly settingsStore: SettingsStoreService) {}

  async getSettings(): Promise<SmtpSettingsDto> {
    const smtp = await this.getInternalSettings();
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

  async updateSettings(update: UpdateSmtpSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'service')) {
      await this.settingsStore.setPlainSetting(SMTP_PARENT, SMTP_KEYS.service, update.service ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'host')) {
      await this.settingsStore.setPlainSetting(SMTP_PARENT, SMTP_KEYS.host, update.host ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'port')) {
      const portValue = update.port ?? null;
      await this.settingsStore.setPlainSetting(
        SMTP_PARENT,
        SMTP_KEYS.port,
        portValue === null ? null : String(portValue),
      );
    }
    if (Object.prototype.hasOwnProperty.call(update, 'secure')) {
      const secureValue = update.secure ?? null;
      await this.settingsStore.setPlainSetting(
        SMTP_PARENT,
        SMTP_KEYS.secure,
        secureValue === null ? null : String(secureValue),
      );
    }
    if (Object.prototype.hasOwnProperty.call(update, 'user')) {
      await this.settingsStore.setPlainSetting(SMTP_PARENT, SMTP_KEYS.user, update.user ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'pass')) {
      await this.settingsStore.setSecretSetting(SMTP_PARENT, SMTP_KEYS.pass, update.pass ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(update, 'from')) {
      await this.settingsStore.setPlainSetting(SMTP_PARENT, SMTP_KEYS.from, update.from ?? null);
    }
  }

  async getConfiguration(): Promise<SmtpSettingsInternal | null> {
    const smtp = await this.getInternalSettings();
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

  private async getInternalSettings(): Promise<SmtpSettingsInternal> {
    const serviceRaw = await this.settingsStore.getPlainSetting(SMTP_PARENT, SMTP_KEYS.service);
    const service = this.normalizeService(serviceRaw);

    const [host, portRaw, secureRaw, user, from, pass] = await Promise.all([
      this.settingsStore.getPlainSetting(SMTP_PARENT, SMTP_KEYS.host),
      this.settingsStore.getPlainSetting(SMTP_PARENT, SMTP_KEYS.port),
      this.settingsStore.getPlainSetting(SMTP_PARENT, SMTP_KEYS.secure),
      this.settingsStore.getPlainSetting(SMTP_PARENT, SMTP_KEYS.user),
      this.settingsStore.getPlainSetting(SMTP_PARENT, SMTP_KEYS.from),
      this.settingsStore.getSecretSetting(SMTP_PARENT, SMTP_KEYS.pass),
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

  private normalizeService(value: string | null): SmtpServiceType | null {
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
}
