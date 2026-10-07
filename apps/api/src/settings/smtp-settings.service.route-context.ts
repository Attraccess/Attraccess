import { BadRequestException, Logger } from '@nestjs/common';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsInternal } from './smtp-settings.service.feature-definitions';

export abstract class SmtpSettingsServiceRouteContext {
  public abstract buildTransportOptions(config: SmtpSettingsInternal): SMTPTransport.Options;
  protected abstract buildSmtpError(prefix: string, error: unknown): BadRequestException;
  protected abstract readonly logger: Logger;
  protected abstract getInternalSettings(): Promise<SmtpSettingsInternal>;
  protected abstract readonly settingsStore: SettingsStoreService;
  protected abstract normalizeService(value: string | null): SmtpServiceType | null;
  protected abstract parseNumber(value: string | null): number | null;
  protected abstract parseBoolean(value: string | null): boolean | null;
}
