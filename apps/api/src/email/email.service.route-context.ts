import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EmailTemplate, EmailTemplateType, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { EntityManager, Repository } from 'typeorm';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { EmailTemplateService } from '../email-template/email-template.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';
import { SettingsService } from '../settings/settings.service';

export const EMAIL_LOGO_CID = 'attraccess-logo';

export const EMAIL_LOGO_PATH =
  [join(__dirname, 'assets', 'logo.png'), join(__dirname, '..', 'assets', 'logo.png')].find(existsSync) ??
  join(__dirname, 'assets', 'logo.png');

export abstract class EmailServiceRouteContext {
  protected abstract readonly emailTemplateService: EmailTemplateService;
  protected abstract readonly emailLayoutService: EmailLayoutService;
  protected abstract convertTemplate(
    template: EmailTemplate,
    context: Record<string, unknown>,
    locale: string,
  ): Promise<{ subject: string; body: string }>;
  protected abstract createTransporter(): Promise<{ transporter: ReturnType<typeof createTransport>; from: string }>;
  protected abstract readonly logger: Logger;
  protected abstract readonly externalCallTimer: ExternalCallTimer;
  protected abstract readonly metricsService: MetricsService;
  protected abstract readonly settingsService: SettingsService;
  protected abstract getBaseContext(user: User): Promise<{
    readonly user: { readonly username: string; readonly email: string; readonly id: number };
    readonly host: {
      readonly frontend: string;
      readonly backend: string;
      readonly notificationPreferencesUrl: `${string}/account`;
      readonly logoUrl: 'cid:attraccess-logo';
    };
    readonly url: string;
  }>;
  protected abstract sendEmail(
    user: User,
    templateType: EmailTemplateType,
    context: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void>;
  protected abstract readonly userRepository: Repository<User>;
}
