import { MailerService } from '@nestjs-modules/mailer';
import { EmailService } from './email.service';
import { EmailTemplateType, User } from '@attraccess/database-entities';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateService } from '../email-template/email-template.service';
import { MjmlService } from '../email-template/mjml.service';

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
    } as unknown as User);

  const setup = () => {
    const mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app') {
          return {
            ATTRACCESS_FRONTEND_URL: 'https://frontend.example',
            ATTRACCESS_URL: 'https://backend.example',
          };
        }
        return undefined;
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
      mailerService as unknown as MailerService,
      configService as unknown as ConfigService,
      emailTemplateService as unknown as EmailTemplateService,
      mjmlService as unknown as MjmlService
    );

    return { service, mailerService, configService, emailTemplateService, mjmlService };
  };

  it('sends username changed email with resolved variables', async () => {
    const { service, mailerService } = setup();
    const user = makeUser({ username: 'alice' });

    await service.sendUsernameChangedEmail(user, 'old_alice');

    expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
    const callArg = (mailerService.sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('alice@example.com');
    expect(callArg.subject).toBe('Username changed for alice');
    expect(callArg.html).toContain('Hello alice');
    expect(callArg.html).toContain('old_alice');
    expect(callArg.html).toContain('alice'); // newUsername also equals current username
    expect(callArg.html).toContain('https://frontend.example');
    expect(callArg.html).toContain('https://backend.example');
  });

  it('sends verification email with correct URL', async () => {
    const { service, mailerService } = setup();
    const user = makeUser({ email: 'bob@example.com' });
    const token = 'verify-token-123';

    await service.sendVerificationEmail(user, token);

    expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
    const callArg = (mailerService.sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('bob@example.com');
    expect(callArg.subject).toContain('Verify bob@example.com');
    expect(callArg.html).toMatch(
      /https:\/\/frontend\.example\/verify-email\?email(?:=|&#x3D;)bob%40example\.com(?:&|&amp;)token(?:=|&#x3D;)verify-token-123/
    );
  });

  it('sends password reset email with correct URL', async () => {
    const { service, mailerService } = setup();
    const user = makeUser({ id: 42, email: 'charlie@example.com' });
    const token = 'reset-token-XYZ';

    await service.sendPasswordResetEmail(user, token);

    expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
    const callArg = (mailerService.sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('charlie@example.com');
    expect(callArg.subject).toContain('Reset password for charlie@example.com');
    expect(callArg.html).toMatch(
      /https:\/\/frontend\.example\/reset-password\?userId(?:=|&#x3D;)42(?:&|&amp;)token(?:=|&#x3D;)reset-token-XYZ/
    );
  });

  it('bubbles up errors when sending fails', async () => {
    const { service, mailerService } = setup();
    (mailerService.sendMail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const user = makeUser();

    await expect(service.sendVerificationEmail(user, 'tok')).rejects.toThrow('SMTP down');
  });
});
