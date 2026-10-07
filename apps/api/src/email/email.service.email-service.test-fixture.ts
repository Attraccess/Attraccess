import { EmailService } from './email.service';
import { EmailTemplateType, User } from '@attraccess/database-entities';
import { EmailTemplateService } from '../email-template/email-template.service';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { createTransport } from 'nodemailer';
import { SettingsService } from '../settings/settings.service';
import { SmtpServiceType } from '../settings/dto/smtp-settings.dto';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { Repository } from 'typeorm';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

export function registerEmailServiceFixture() {
  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      isEmailVerified: false,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      externalIdentifier: null,
      nfcKeySeedToken: null,
      lastUsernameChangeAt: null,
      ...overrides,
    }) as unknown as User;

  const setup = () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn();
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close });

    const settingsService = {
      getUrl: jest.fn().mockResolvedValue('https://frontend.example'),
      getSmtpConfiguration: jest.fn().mockResolvedValue({
        service: SmtpServiceType.SMTP,
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'mailer@example.com',
        pass: 'secret',
        from: 'no-reply@example.com',
        passConfigured: true,
      }),
      buildSmtpTransportOptions: jest.fn().mockReturnValue({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'mailer@example.com', pass: 'secret' },
      }),
    };
    const emailTemplateService = {
      findOne: jest.fn().mockImplementation((type: EmailTemplateType) => {
        if (type === EmailTemplateType.USERNAME_CHANGED) {
          return Promise.resolve({
            type,
            subject: 'Username changed for {{user.username}}',
            body: '<mjml><mj-body><mj-section><mj-column><mj-image src="{{host.logoUrl}}"/><mj-text>Hello {{user.username}},</mj-text><mj-text>Your username was changed from <strong>{{user.previousUsername}}</strong> to <strong>{{user.newUsername}}</strong>.</mj-text><mj-text>FE {{host.frontend}} BE {{host.backend}}</mj-text><mj-text>URL: {{url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.VERIFY_EMAIL) {
          return Promise.resolve({
            type,
            subject: 'Verify {{user.email}}',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Verify: {{url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.RESET_PASSWORD) {
          return Promise.resolve({
            type,
            subject: 'Reset password for {{user.email}}',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Reset: {{url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY) {
          return Promise.resolve({
            type,
            subject: 'Your usage receipt for {{resource.name}}',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>{{user.username}}</mj-text><mj-text>{{resource.name}}</mj-text><mj-text>{{usage.roundedMinutes}}</mj-text><mj-text>{{totalCredits}}</mj-text><mj-text>{{newBalance}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.RESOURCE_TAKEOVER) {
          return Promise.resolve({
            type,
            subject: '{{resource.name}} was taken over',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{user.username}}</mj-text><mj-text>{{takeover.actorName}} took over {{resource.name}}</mj-text><mj-text>{{resource.url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.ACCESS_CHANGE) {
          return Promise.resolve({
            type,
            subject: '{{accessChange.title}}',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{user.username}}</mj-text><mj-text>{{accessChange.body}}</mj-text><mj-button href="{{accessChange.url}}">View change</mj-button></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.RESOURCE_SESSION_ENDED) {
          return Promise.resolve({
            type,
            subject: '{{resource.name}} session ended',
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{user.username}}</mj-text><mj-text>{{session.endedBy}} ended your session on {{resource.name}}.</mj-text><mj-text>{{resource.url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.RESOURCE_HEALTH_CHANGED) {
          return Promise.resolve({
            type,
            subject: 'Resource health update: {{resource.name}}',
            body: '<mjml><mj-body><mj-section><mj-column>{{#if health.isDegraded}}<mj-text>Degraded</mj-text>{{else}}<mj-text>Recovered</mj-text>{{/if}}<mj-text>{{health.status}}</mj-text><mj-text>{{health.identifier}}</mj-text><mj-text>{{resource.url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.USER_RETRAINING_REQUIRED) {
          return Promise.resolve({
            type,
            subject: 'Retraining required for {{resource.name}}',
            body: '<mjml><mj-body><mj-section><mj-column>{{#if retraining.isAge}}<mj-text>Age reason</mj-text>{{else if retraining.isInactivity}}<mj-text>Inactivity reason</mj-text>{{else}}<mj-text>Default reason</mj-text>{{/if}}{{#if retraining.blocksAccess}}<mj-text>Access blocked</mj-text>{{/if}}<mj-text>{{resource.url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        if (type === EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED) {
          return Promise.resolve({
            type,
            subject: 'Note added for {{resource.name}}',
            body: '<mjml><mj-body><mj-section><mj-column>{{#if note.isStart}}<mj-text>Start note</mj-text>{{else}}<mj-text>End note</mj-text>{{/if}}<mj-text>{{note.content}}</mj-text><mj-text>{{note.authorName}}</mj-text></mj-column></mj-section></mj-body></mjml>',
          });
        }
        throw new Error('Unexpected template type');
      }),
      getTranslationsMap: jest.fn().mockResolvedValue({}),
    };
    const emailLayoutService = {
      renderWithTemplate: jest.fn().mockImplementation((template: { body: string }) => Promise.resolve(template.body)),
    };

    const metricsService = {
      emailSentTotal: { inc: jest.fn() },
    };

    const externalCallTimer = {
      time: <T>(_target: string, _operation: string, fn: () => Promise<T>) => fn(),
    };

    const userRepository = {
      findOne: jest.fn(),
    };

    const service = new EmailService(
      settingsService as unknown as SettingsService,
      emailTemplateService as unknown as EmailTemplateService,
      emailLayoutService as unknown as EmailLayoutService,
      metricsService as unknown as MetricsService,
      externalCallTimer as unknown as ExternalCallTimer,
      userRepository as unknown as Repository<User>,
    );

    return { service, sendMail, close, settingsService, emailTemplateService, emailLayoutService, userRepository };
  };
  return {
    get makeUser() {
      return makeUser;
    },
    get setup() {
      return setup;
    },
  };
}
