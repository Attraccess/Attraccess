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
import { MjmlService } from '../email-template/mjml.service';
import { createTransport } from 'nodemailer';
import { SettingsService } from '../settings/settings.service';
import { SmtpServiceType } from '../settings/dto/smtp-settings.dto';

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
      systemPermissions: { canManageResources: false, canManageSystemConfiguration: false, canManageUsers: false },
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
        throw new Error('Unexpected template type');
      }),
    };
    const mjmlService = {
      validateAndConvert: jest.fn().mockImplementation((template: string) => {
        // In tests, treat MJML string as already-valid Handlebars HTML fragment for simplicity
        // The service will compile it with Handlebars and we can assert on the output
        return template;
      }),
    };

    const service = new EmailService(
      settingsService as unknown as SettingsService,
      emailTemplateService as unknown as EmailTemplateService,
      mjmlService as unknown as MjmlService,
    );

    return { service, sendMail, close, settingsService, emailTemplateService, mjmlService };
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
});
