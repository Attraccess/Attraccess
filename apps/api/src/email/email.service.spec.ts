/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  BillingTransaction,
  BillingTransactionItem,
  EmailTemplateType,
  Resource,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { EmailTemplateService } from './../email-template/email-template.service';
import { EmailService } from './email.service';
import { inheritTestScope } from './../test-utils/inherit-test-scope';
import { makeUser, setup } from './email.service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('EmailService', () => {
  const scope = {
    get setup() {
      return setup;
    },
    get makeUser() {
      return makeUser;
    },
  };

  it('sends username changed email with resolved variables', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ username: 'alice' });

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
    expect(callArg.attachments).toEqual([
      expect.objectContaining({
        filename: 'logo.png',
        contentType: 'image/png',
        cid: 'attraccess-logo',
        path: expect.stringMatching(/assets\/logo\.png$/),
      }),
    ]);
    expect(callArg.html).toContain('cid:attraccess-logo');
  });

  it('sends verification email with correct URL', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'bob@example.com' });
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
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ id: 42, email: 'charlie@example.com' });
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
    const { service, sendMail } = scope.setup();
    (sendMail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const user = scope.makeUser();

    await expect(service.sendVerificationEmail(user, 'tok')).rejects.toThrow('SMTP down');
  });

  it('sends billing transaction summary email with expected context', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ id: 7, username: 'dana', email: 'dana@example.com', creditBalance: 1234 });

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
      usageInMinutes: 999, // The settled item quantity, not a recalculation, is authoritative.
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
    expect(callArg.html).not.toContain('999');
  });

  it('sends resource takeover email with expected context', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ id: 2, username: 'bob', email: 'bob@example.com' });

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
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ username: 'dana', email: 'dana@example.com' });

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
    const { service, sendMail, userRepository } = scope.setup();
    userRepository.findOne.mockResolvedValue(scope.makeUser({ id: 7, username: 'riley', email: 'riley@example.com' }));

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
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ id: 7, username: 'dana', email: 'dana@example.com' });

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
    const sendResourceHealthChangedEmailScope = inheritTestScope(
      {
        get setup() {
          return scope.setup;
        },
        get makeUser() {
          return scope.makeUser;
        },
      },
      scope,
    );

    it('passes isDegraded=true and headerColor for unhealthy status', async () => {
      const { service, sendMail } = sendResourceHealthChangedEmailScope.setup();
      const user = sendResourceHealthChangedEmailScope.makeUser({ email: 'alice@example.com' });

      await service.sendResourceHealthChangedEmail(
        user,
        { id: 1, name: 'Laser Cutter' },
        {
          status: 'unhealthy' as never,
          previousStatus: 'healthy' as never,
          reason: 'sensor offline',
          identifier: 'laser.temperature',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Degraded');
      expect(html).not.toContain('Recovered');
      expect(html).toContain('unhealthy');
      expect(html).toContain('https://frontend.example/resources/1');
    });

    it('passes isDegraded=false for healthy status', async () => {
      const { service, sendMail } = sendResourceHealthChangedEmailScope.setup();
      const user = sendResourceHealthChangedEmailScope.makeUser({ email: 'alice@example.com' });

      await service.sendResourceHealthChangedEmail(
        user,
        { id: 2, name: 'Laser Cutter' },
        {
          status: 'healthy' as never,
          previousStatus: 'unhealthy' as never,
          reason: null,
          identifier: 'laser.temperature',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Recovered');
      expect(html).not.toContain('Degraded');
    });

    it('skips send when user has no email', async () => {
      const { service, sendMail } = sendResourceHealthChangedEmailScope.setup();
      await service.sendResourceHealthChangedEmail(
        { email: null } as never,
        { id: 1, name: 'X' },
        {
          status: 'unhealthy' as never,
          previousStatus: null,
          reason: null,
          identifier: 'x',
        },
      );
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendUserRetrainingEmail', () => {
    const sendUserRetrainingEmailScope = inheritTestScope(
      {
        get setup() {
          return scope.setup;
        },
        get makeUser() {
          return scope.makeUser;
        },
      },
      scope,
    );

    it('sets isAge=true for age reason', async () => {
      const { service, sendMail } = sendUserRetrainingEmailScope.setup();
      const user = sendUserRetrainingEmailScope.makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(
        user,
        { id: 5, name: 'Printer', isGroup: false },
        {
          reason: 'age',
          blocksAccess: true,
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Age reason');
      expect(html).not.toContain('Inactivity reason');
      expect(html).toContain('Access blocked');
      expect(html).toContain('https://frontend.example/resources/5');
    });

    it('sets isInactivity=true for inactivity reason', async () => {
      const { service, sendMail } = sendUserRetrainingEmailScope.setup();
      const user = sendUserRetrainingEmailScope.makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(
        user,
        { id: 3, name: 'Printer', isGroup: false },
        {
          reason: 'inactivity',
          blocksAccess: false,
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Inactivity reason');
      expect(html).not.toContain('Age reason');
      expect(html).not.toContain('Access blocked');
    });

    it('sets both flags false for null reason', async () => {
      const { service, sendMail } = sendUserRetrainingEmailScope.setup();
      const user = sendUserRetrainingEmailScope.makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(
        user,
        { id: 3, name: 'Printer', isGroup: false },
        {
          reason: null,
          blocksAccess: false,
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Default reason');
    });
  });

  describe('sendResourceUsageNoteEmail', () => {
    const sendResourceUsageNoteEmailScope = inheritTestScope(
      {
        get setup() {
          return scope.setup;
        },
        get makeUser() {
          return scope.makeUser;
        },
      },
      scope,
    );

    it('sets isStart=true for start phase', async () => {
      const { service, sendMail } = sendResourceUsageNoteEmailScope.setup();
      const user = sendResourceUsageNoteEmailScope.makeUser({ email: 'carol@example.com' });

      await service.sendResourceUsageNoteEmail(
        user,
        { id: 7, name: 'CNC' },
        {
          content: 'Blade worn',
          phase: 'start',
          authorName: 'alice',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Start note');
      expect(html).not.toContain('End note');
      expect(html).toContain('Blade worn');
      expect(html).toContain('alice');
    });

    it('sets isStart=false for end phase', async () => {
      const { service, sendMail } = sendResourceUsageNoteEmailScope.setup();
      const user = sendResourceUsageNoteEmailScope.makeUser({ email: 'carol@example.com' });

      await service.sendResourceUsageNoteEmail(
        user,
        { id: 7, name: 'CNC' },
        {
          content: 'All good',
          phase: 'end',
          authorName: 'bob',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('End note');
      expect(html).not.toContain('Start note');
    });
  });

  describe('{{t}} Handlebars helper', () => {
    const setupT = (translationsMap: Record<string, string> = {}, templateBody?: string) => {
      const base = scope.setup();
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
    const tHandlebarsHelperScope = inheritTestScope(
      {
        get setupT() {
          return setupT;
        },
        get makeUser() {
          return scope.makeUser;
        },
      },
      scope,
    );

    it('interpolates {var} placeholders from hash args using the default value', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT({});
      await service.sendVerificationEmail(
        tHandlebarsHelperScope.makeUser({ username: 'alice', email: 'alice@example.com' }),
        'tok',
      );
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hello alice!');
    });

    it('uses the system default for mail without a user locale and keeps explicit user locales', async () => {
      const { service, sendMail, settingsService, emailTemplateService } = tHandlebarsHelperScope.setupT();
      settingsService.resolveLanguage.mockImplementation(async (locale) => locale ?? 'de');
      settingsService.getDefaultLanguage.mockResolvedValue('de');
      emailTemplateService.getTranslationsMap.mockImplementation(async (_type, locale) =>
        locale === 'de' ? { greeting: 'Hallo {name}!' } : {},
      );
      await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser(), 'tok');
      expect(sendMail.mock.calls[0][0].html).toContain('Hallo alice!');
      await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser({ locale: 'en' }), 'tok');
      expect(sendMail.mock.calls[1][0].html).toContain('Hello alice!');
    });

    it('falls back to the system translation for unsupported locales but keeps custom translations', async () => {
      const { service, sendMail, settingsService, emailTemplateService } = tHandlebarsHelperScope.setupT();
      settingsService.getDefaultLanguage.mockResolvedValue('de');
      emailTemplateService.getTranslationsMap.mockImplementation(async (_type, locale) =>
        locale === 'de' ? { greeting: 'Hallo {name}!' } : locale === 'it' ? { greeting: 'Ciao {name}!' } : {},
      );
      emailTemplateService.getExactTranslationsMap.mockImplementation(async (_type, locale) =>
        locale === 'it-it' ? { greeting: 'Ciao regionale {name}!' } : {},
      );
      for (const locale of ['fr-FR', 'en-!!!', 'it', 'it-it']) {
        await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser({ locale }), 'tok');
      }
      expect(sendMail.mock.calls[0][0].html).toContain('Hallo alice!');
      expect(sendMail.mock.calls[1][0].html).toContain('Hallo alice!');
      expect(sendMail.mock.calls[2][0].html).toContain('Ciao alice!');
      expect(sendMail.mock.calls[3][0].html).toContain('Ciao regionale alice!');
      settingsService.getDefaultLanguage.mockResolvedValue('en');
      await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser({ locale: 'fr' }), 'tok');
      expect(sendMail.mock.calls[4][0].html).toContain('Hello alice!');
      await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser({ locale: 'de-u-ca-ca-12' }), 'tok');
      expect(sendMail.mock.calls[5][0].html).toContain('Hello alice!');
    });

    it('uses DB translation over default and still interpolates {var}', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT({ greeting: 'Hallo {name}!' });
      await service.sendVerificationEmail(
        tHandlebarsHelperScope.makeUser({ username: 'alice', email: 'alice@example.com' }),
        'tok',
      );
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hallo alice!');
      expect(html).not.toContain('Hello alice!');
    });

    it.each([undefined, '', 'Hoi {name}!'])(
      'preserves canonical regional translations with exact-tag override %s',
      async (exactGreeting) => {
        const { service, sendMail, emailTemplateService } = tHandlebarsHelperScope.setupT();
        const rows = [
          { locale: 'de', key: 'greeting', value: 'Hallo {name}!' },
          { locale: 'de', key: 'footer', value: 'Basis' },
          { locale: 'de-CH', key: 'greeting', value: 'Grüezi {name}!' },
          { locale: 'de-CH', key: 'footer', value: 'Schweiz' },
          ...(exactGreeting === undefined ? [] : [{ locale: 'de-ch', key: 'greeting', value: exactGreeting }]),
        ];
        const translations = new EmailTemplateService(
          {} as never,
          { findBy: jest.fn(async ({ locale }) => rows.filter((row) => row.locale === locale)) } as never,
          {} as never,
        );
        emailTemplateService.getTranslationsMap.mockImplementation(translations.getTranslationsMap.bind(translations));
        emailTemplateService.getExactTranslationsMap.mockImplementation(
          translations.getExactTranslationsMap.bind(translations),
        );
        emailTemplateService.findOne.mockResolvedValue({
          type: EmailTemplateType.VERIFY_EMAIL,
          subject: "{{t 'greeting' 'Hello {name}!' name=user.username}}",
          body: "{{t 'footer' 'Footer'}}",
        });
        await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser({ locale: 'de-ch' }), 'tok');
        expect(sendMail.mock.calls[0][0].subject).toBe(exactGreeting ? 'Hoi alice!' : 'Grüezi alice!');
        expect(sendMail.mock.calls[0][0].html).toBe('Schweiz');
      },
    );

    it('leaves unresolved {var} literals intact when hash arg is missing', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT(
        {},
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'k' 'Value: {missing}'}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>',
      );
      await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser(), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('{missing}');
    });

    it('escapes HTML-dangerous characters in interpolated values', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT({});
      await service.sendVerificationEmail(
        tHandlebarsHelperScope.makeUser({ username: '<script>alert(1)</script>' }),
        'tok',
      );
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does not double-escape HTML tags present in the translation string itself', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT({ greeting: '<strong>{name}</strong>' });
      await service.sendVerificationEmail(tHandlebarsHelperScope.makeUser({ username: 'alice' }), 'tok');
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('<strong>alice</strong>');
      expect(html).not.toContain('&lt;strong&gt;');
    });

    it('does not crash when called with one arg (no defaultValue)', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT(
        {},
        '<mjml><mj-body><mj-section><mj-column>' +
          "<mj-text>{{t 'greeting'}}</mj-text>" +
          '</mj-column></mj-section></mj-body></mjml>',
      );
      await expect(service.sendVerificationEmail(tHandlebarsHelperScope.makeUser(), 'tok')).resolves.not.toThrow();
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toBeDefined();
    });

    it('falls back to default when DB translation is an empty string', async () => {
      const { service, sendMail } = tHandlebarsHelperScope.setupT({ greeting: '' });
      await service.sendVerificationEmail(
        tHandlebarsHelperScope.makeUser({ username: 'alice', email: 'alice@example.com' }),
        'tok',
      );
      const html = (sendMail as jest.Mock).mock.calls[0][0].html;
      expect(html).toContain('Hello alice!');
    });
  });
});

export type EmailServiceTestScope = {
  setup: () => {
    service: EmailService;
    sendMail: any;
    close: any;
    settingsService: { getUrl: any; getSmtpConfiguration: any; buildSmtpTransportOptions: any };
    emailTemplateService: { findOne: any; getTranslationsMap: any; getExactTranslationsMap: any };
    emailLayoutService: { renderWithTemplate: any };
    userRepository: { findOne: any };
  };
  makeUser: (overrides?: Partial<User>) => User;
};
