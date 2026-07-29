import { EmailService } from './email.service';
import {
  EmailTemplateType,
  User,
  BillingTransaction,
  BillingTransactionItem,
  ResourceUsage,
  Resource,
} from '@attraccess/database-entities';
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

describe('EmailService', () => {
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
            body: '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{user.username}},</mj-text><mj-text>Your username was changed from <strong>{{user.previousUsername}}</strong> to <strong>{{user.newUsername}}</strong>.</mj-text><mj-text>FE {{host.frontend}} BE {{host.backend}}</mj-text><mj-text>URL: {{url}}</mj-text></mj-column></mj-section></mj-body></mjml>',
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

  it('sends username changed email with resolved variables', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ username: 'alice' });

    await service.sendUsernameChangedEmail(user, 'old_alice');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('alice@example.com');
    expect(callArg.subject).toBe('Username changed for alice');
    expect(callArg.html).toContain('Hello alice');
    expect(callArg.html).toContain('old_alice');
    expect(callArg.html).toContain('alice'); // newUsername also equals current username
    // host.frontend and host.backend both resolve to the single app URL
    expect(callArg.html).toContain('https://frontend.example');
  });

  it('sends verification email with correct URL', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ email: 'bob@example.com' });
    const token = 'verify-token-123';

    await service.sendVerificationEmail(user, token);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('bob@example.com');
    expect(callArg.subject).toContain('Verify bob@example.com');
    expect(callArg.html).toMatch(
      /https:\/\/frontend\.example\/verify-email\?email(?:=|&#x3D;)bob%40example\.com(?:&|&amp;)token(?:=|&#x3D;)verify-token-123/,
    );
  });

  it('sends password reset email with correct URL', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ id: 42, email: 'charlie@example.com' });
    const token = 'reset-token-XYZ';

    await service.sendPasswordResetEmail(user, token);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('charlie@example.com');
    expect(callArg.subject).toContain('Reset password for charlie@example.com');
    expect(callArg.html).toMatch(
      /https:\/\/frontend\.example\/reset-password\?userId(?:=|&#x3D;)42(?:&|&amp;)token(?:=|&#x3D;)reset-token-XYZ/,
    );
  });

  it('bubbles up errors when sending fails', async () => {
    const { service, sendMail } = setup();
    (sendMail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const user = makeUser();

    await expect(service.sendVerificationEmail(user, 'tok')).rejects.toThrow('SMTP down');
  });

  it('sends billing transaction summary email with expected context', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ id: 7, username: 'dana', email: 'dana@example.com', creditBalance: 1234 });

    const transaction: Partial<BillingTransaction> = {
      id: 99,
      userId: 7,
      amount: -345, // charged 345 credits
      items: [
        { name: 'PER_SESSION', unitPrice: 100, quantity: 1 },
        { name: 'PER_MINUTE', unitPrice: 5, quantity: 70 },
        { name: 'BILLING_FACTOR', unitPrice: -55, quantity: 1 },
      ] as unknown as BillingTransactionItem[],
    };

    const usage: Partial<ResourceUsage> = {
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T11:10:00Z'),
      usageInMinutes: 70,
      resource: { id: 3, name: 'Laser Cutter' } as Resource,
      user,
    };

    await service.sendResourceUsageBillingSummaryEmail(
      user,
      transaction as BillingTransaction,
      usage as ResourceUsage,
      2,
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('dana@example.com');
    expect(callArg.subject).toContain('Laser Cutter');
    expect(callArg.html).toContain('dana');
    expect(callArg.html).toContain('Laser Cutter');
    expect(callArg.html).toContain('70');
    // With minor unit 2, amounts are converted to user currency strings
    expect(callArg.html).toContain('3.45');
    expect(callArg.html).toContain('12.34');
  });

  it('sends resource takeover email with expected context', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ id: 2, username: 'bob', email: 'bob@example.com' });

    await service.sendResourceTakeoverEmail(user, { id: 4, name: 'Laser Cutter' }, { actorName: 'alice' });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('bob@example.com');
    expect(callArg.subject).toBe('Laser Cutter was taken over');
    expect(callArg.html).toContain('Hello bob');
    expect(callArg.html).toContain('alice took over Laser Cutter');
    expect(callArg.html).toContain('https://frontend.example/resources/4');
  });

  it('sends access change email with title, body and resolved URL', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ username: 'dana', email: 'dana@example.com' });

    await service.sendAccessChangeEmail(user, {
      title: 'Your resource access changed',
      body: 'You were made an introducer for resource #7.',
      url: '/resources/7',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('dana@example.com');
    expect(callArg.subject).toBe('Your resource access changed');
    expect(callArg.html).toContain('Hello dana');
    expect(callArg.html).toContain('You were made an introducer for resource #7.');
    expect(callArg.html).toContain('https://frontend.example/resources/7');
  });

  it('loads a full recipient before sending access-change email for id-only notification recipients', async () => {
    const { service, sendMail, userRepository } = setup();
    userRepository.findOne.mockResolvedValue(makeUser({ id: 7, username: 'riley', email: 'riley@example.com' }));

    await service.sendAccessChangeEmail({ id: 7 } as User, {
      title: 'Your group access changed',
      body: 'You received an introduction for group #5.',
      url: '/resource-groups/5',
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('riley@example.com');
    expect(callArg.html).toContain('Hello riley');
    expect(callArg.html).toContain('https://frontend.example/resource-groups/5');
  });

  it('sends resource session ended email with resource URL and actor context', async () => {
    const { service, sendMail } = setup();
    const user = makeUser({ id: 7, username: 'dana', email: 'dana@example.com' });

    await service.sendResourceSessionEndedEmail(user, { id: 3, name: 'Laser Cutter' } as Resource, {
      id: 99,
      endedAt: new Date('2026-01-01T12:00:00.000Z'),
      endedBy: 'alice',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('dana@example.com');
    expect(callArg.subject).toBe('Laser Cutter session ended');
    expect(callArg.html).toContain('Hello dana');
    expect(callArg.html).toContain('alice ended your session on Laser Cutter');
    expect(callArg.html).toContain('https://frontend.example/resources/3');
  });

  describe('sendResourceHealthChangedEmail', () => {
    it('passes isDegraded=true and headerColor for unhealthy status', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'alice@example.com' });

      await service.sendResourceHealthChangedEmail(user, { id: 1, name: 'Laser Cutter' }, {
        status: 'unhealthy' as never,
        previousStatus: 'healthy' as never,
        reason: 'sensor offline',
        identifier: 'laser.temperature',
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Degraded');
      expect(html).not.toContain('Recovered');
      expect(html).toContain('unhealthy');
      expect(html).toContain('https://frontend.example/resources/1');
    });

    it('passes isDegraded=false for healthy status', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'alice@example.com' });

      await service.sendResourceHealthChangedEmail(user, { id: 2, name: 'Laser Cutter' }, {
        status: 'healthy' as never,
        previousStatus: 'unhealthy' as never,
        reason: null,
        identifier: 'laser.temperature',
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Recovered');
      expect(html).not.toContain('Degraded');
    });

    it('skips send when user has no email', async () => {
      const { service, sendMail } = setup();
      await service.sendResourceHealthChangedEmail({ email: null } as never, { id: 1, name: 'X' }, {
        status: 'unhealthy' as never,
        previousStatus: null,
        reason: null,
        identifier: 'x',
      });
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendUserRetrainingEmail', () => {
    it('sets isAge=true for age reason', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(user, { id: 5, name: 'Printer', isGroup: false }, {
        reason: 'age',
        blocksAccess: true,
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Age reason');
      expect(html).not.toContain('Inactivity reason');
      expect(html).toContain('Access blocked');
      expect(html).toContain('https://frontend.example/resources/5');
    });

    it('sets isInactivity=true for inactivity reason', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(user, { id: 3, name: 'Printer', isGroup: false }, {
        reason: 'inactivity',
        blocksAccess: false,
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Inactivity reason');
      expect(html).not.toContain('Age reason');
      expect(html).not.toContain('Access blocked');
    });

    it('sets both flags false for null reason', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(user, { id: 3, name: 'Printer', isGroup: false }, {
        reason: null,
        blocksAccess: false,
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Default reason');
    });
  });

  describe('sendResourceUsageNoteEmail', () => {
    it('sets isStart=true for start phase', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'carol@example.com' });

      await service.sendResourceUsageNoteEmail(user, { id: 7, name: 'CNC' }, {
        content: 'Blade worn',
        phase: 'start',
        authorName: 'alice',
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Start note');
      expect(html).not.toContain('End note');
      expect(html).toContain('Blade worn');
      expect(html).toContain('alice');
    });

    it('sets isStart=false for end phase', async () => {
      const { service, sendMail } = setup();
      const user = makeUser({ email: 'carol@example.com' });

      await service.sendResourceUsageNoteEmail(user, { id: 7, name: 'CNC' }, {
        content: 'All good',
        phase: 'end',
        authorName: 'bob',
      });

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('End note');
      expect(html).not.toContain('Start note');
    });
  });

  describe('{{t}} Handlebars helper', () => {
    const setupT = (translationsMap: Record<string, string> = {}, templateBody?: string) => {
      const base = setup();
      const body =
        templateBody ??
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'greeting' 'Hello {name}!' name=user.username}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>';

      base.emailTemplateService.findOne.mockImplementation((type: EmailTemplateType) => {
        if (type === EmailTemplateType.VERIFY_EMAIL) {
          return Promise.resolve({ type, subject: 'Test', body });
        }
        return Promise.reject(new Error('Unexpected template type'));
      });
      base.emailTemplateService.getTranslationsMap.mockResolvedValue(translationsMap);
      return base;
    };

    it('interpolates {var} placeholders from hash args using the default value', async () => {
      const { service, sendMail } = setupT({});
      await service.sendVerificationEmail(makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hello alice!');
    });

    it('uses DB translation over default and still interpolates {var}', async () => {
      const { service, sendMail } = setupT({ greeting: 'Hallo {name}!' });
      await service.sendVerificationEmail(makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hallo alice!');
      expect(html).not.toContain('Hello alice!');
    });

    it('leaves unresolved {var} literals intact when hash arg is missing', async () => {
      const { service, sendMail } = setupT(
        {},
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'k' 'Value: {missing}'}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>',
      );
      await service.sendVerificationEmail(makeUser(), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('{missing}');
    });

    it('escapes HTML-dangerous characters in interpolated values', async () => {
      const { service, sendMail } = setupT({});
      await service.sendVerificationEmail(makeUser({ username: '<script>alert(1)</script>' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does not double-escape HTML tags present in the translation string itself', async () => {
      const { service, sendMail } = setupT({ greeting: '<strong>{name}</strong>' });
      await service.sendVerificationEmail(makeUser({ username: 'alice' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('<strong>alice</strong>');
      expect(html).not.toContain('&lt;strong&gt;');
    });

    it('does not crash when called with one arg (no defaultValue)', async () => {
      const { service, sendMail } = setupT(
        {},
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'greeting'}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>',
      );
      await expect(service.sendVerificationEmail(makeUser(), 'tok')).resolves.not.toThrow();
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toBeDefined();
    });

    it('falls back to default when DB translation is an empty string', async () => {
      const { service, sendMail } = setupT({ greeting: '' });
      await service.sendVerificationEmail(makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hello alice!');
    });
  });
});
