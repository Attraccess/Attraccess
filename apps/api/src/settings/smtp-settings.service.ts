import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SmtpServiceType, SmtpSettingsDto } from './dto/smtp-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { SettingsStoreService } from './settings-store.service';
import { SmtpConnectionVerificationImplementation } from './smtp-connection-verification';
import { SmtpSettingsInternal } from './smtp-settings.service.feature-definitions';

@Injectable()
export class SmtpSettingsService extends SmtpConnectionVerificationImplementation {
  protected readonly logger = new Logger(SmtpSettingsService.name);

  constructor(protected readonly settingsStore: SettingsStoreService) {
    super();
  }

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
    const auth = config.user || config.pass ? { user: config.user ?? '', pass: config.pass ?? '' } : undefined;

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
}

export { SmtpSettingsInternal } from './smtp-settings.service.feature-definitions';
