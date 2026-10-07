import { SMTP_KEYS, SMTP_PARENT } from './constants';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SmtpSettingsInternal } from './smtp-settings.service.feature-definitions';
import { SmtpSettingsServiceRouteContext } from './smtp-settings.service.route-context';
export abstract class SmtpSettingsStorageImplementation extends SmtpSettingsServiceRouteContext {
  protected async mergeWithCurrentSettings(update: UpdateSmtpSettingsDto): Promise<SmtpSettingsInternal> {
    const current = await this.getInternalSettings();

    return {
      service: Object.prototype.hasOwnProperty.call(update, 'service') ? update.service : current.service,
      host: Object.prototype.hasOwnProperty.call(update, 'host') ? (update.host ?? null) : current.host,
      port: Object.prototype.hasOwnProperty.call(update, 'port') ? (update.port ?? null) : current.port,
      secure: Object.prototype.hasOwnProperty.call(update, 'secure') ? (update.secure ?? null) : current.secure,
      user: Object.prototype.hasOwnProperty.call(update, 'user') ? (update.user ?? null) : current.user,
      pass: Object.prototype.hasOwnProperty.call(update, 'pass') ? (update.pass ?? null) : current.pass,
      from: Object.prototype.hasOwnProperty.call(update, 'from') ? (update.from ?? null) : current.from,
      passConfigured: Object.prototype.hasOwnProperty.call(update, 'pass') ? !!update.pass : current.passConfigured,
    };
  }

  protected async persistSettings(update: UpdateSmtpSettingsDto): Promise<void> {
    if (Object.prototype.hasOwnProperty.call(update, 'service')) {
      await this.settingsStore.setPlainSetting(SMTP_PARENT, SMTP_KEYS.service, update.service);
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

  protected async getInternalSettings(): Promise<SmtpSettingsInternal> {
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

  protected normalizeService(value: string | null): SmtpServiceType | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim() as SmtpServiceType;
    return Object.values(SmtpServiceType).includes(normalized) ? normalized : null;
  }

  protected parseBoolean(value: string | null): boolean | null {
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

  protected parseNumber(value: string | null): number | null {
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
