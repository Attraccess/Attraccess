import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
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

const SMTP_VERIFY_TIMEOUT_MS = 10_000;

const SMTP_ERROR_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Could not connect to the SMTP server. Verify the host and port are correct and the server is running.',
  ENOTFOUND: 'DNS lookup failed for the SMTP host. Verify the hostname is correct.',
  ETIMEDOUT: 'Connection to the SMTP server timed out. Verify the host, port, and firewall settings.',
  ESOCKET: 'TLS/SSL error connecting to the SMTP server. Check the secure setting and port configuration.',
  ECONNRESET: 'Connection to the SMTP server was reset. This may indicate a TLS configuration issue.',
  EDNS: 'DNS resolution failed for the SMTP host. Verify the hostname is correct.',
  EAI_AGAIN: 'Temporary DNS resolution failure. Please try again.',
  EENVELOPE: 'Invalid envelope: check the FROM address format.',
  EMESSAGE: 'Failed to send test email. The server rejected the message.',
};

@Injectable()
export class SmtpSettingsService {
  private readonly logger = new Logger(SmtpSettingsService.name);

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
    const merged = await this.mergeWithCurrentSettings(update);
    await this.verifySmtpConnection(merged);
    await this.persistSettings(update);
  }

  buildTransportOptions(config: SmtpSettingsInternal): SMTPTransport.Options {
    const auth = config.user || config.pass
      ? { user: config.user ?? '', pass: config.pass ?? '' }
      : undefined;

    if (config.service === SmtpServiceType.Outlook365) {
      return { service: 'Outlook365', auth };
    }

    return {
      host: config.host ?? undefined,
      port: config.port ?? undefined,
      secure: config.secure ?? false,
      auth,
    };
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

  private async verifySmtpConnection(config: SmtpSettingsInternal): Promise<void> {
    const transportOptions = this.buildTransportOptions(config);
    const transporter = createTransport(transportOptions);

    try {
      await Promise.race([
        transporter.verify(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SMTP verification timed out')), SMTP_VERIFY_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      throw this.buildSmtpError('SMTP connection verification failed', error);
    }

    try {
      await transporter.sendMail({
        from: config.from ?? '',
        to: config.from ?? '',
        subject: 'Attraccess SMTP Configuration Test',
        text: 'This is an automated test email to verify your SMTP configuration. If you received this email, your SMTP settings are working correctly.',
      });
    } catch (error) {
      throw this.buildSmtpError('SMTP verification succeeded but sending a test email failed', error);
    } finally {
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
    }
  }

  private buildSmtpError(prefix: string, error: unknown): BadRequestException {
    const err = error instanceof Error ? error : new Error(String(error));
    const code = (err as NodeJS.ErrnoException).code;
    const responseCode = (err as { responseCode?: number }).responseCode;

    let detail: string;
    if (code && SMTP_ERROR_MESSAGES[code]) {
      detail = SMTP_ERROR_MESSAGES[code];
    } else if (responseCode === 535 || (err.message && /auth/i.test(err.message))) {
      detail = 'SMTP authentication failed. Verify your username and password.';
    } else {
      detail = err.message || 'Unknown error';
    }

    this.logger.warn(`${prefix}: [${code ?? responseCode ?? 'UNKNOWN'}] ${err.message}`);
    return new BadRequestException(`${prefix}: ${detail}`);
  }

  private async mergeWithCurrentSettings(update: UpdateSmtpSettingsDto): Promise<SmtpSettingsInternal> {
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

  private async persistSettings(update: UpdateSmtpSettingsDto): Promise<void> {
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
