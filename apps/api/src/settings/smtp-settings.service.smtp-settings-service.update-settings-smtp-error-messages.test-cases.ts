import { BadRequestException } from '@nestjs/common';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerUpdateSettingsSmtpErrorMessagesCases(
  fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>,
) {
  describe('updateSettings - SMTP error messages', () => {
    const testErrorMapping = async (
      code: string,
      expectedSubstring: string,
      phase: 'verify' | 'sendMail' = 'verify',
    ) => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());

      if (phase === 'verify') {
        fixture.setupMockTransporter(jest.fn().mockRejectedValue(Object.assign(new Error(`${code} error`), { code })));
      } else {
        fixture.setupMockTransporter(
          jest.fn().mockResolvedValue(true),
          jest.fn().mockRejectedValue(Object.assign(new Error(`${code} error`), { code })),
        );
      }

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(expectedSubstring),
        }),
      );
    };

    it('maps ECONNREFUSED to connection error message', async () => {
      await testErrorMapping('ECONNREFUSED', 'Could not connect to the SMTP server');
    });

    it('maps ENOTFOUND to DNS error message', async () => {
      await testErrorMapping('ENOTFOUND', 'DNS lookup failed');
    });

    it('maps ETIMEDOUT to timeout error message', async () => {
      await testErrorMapping('ETIMEDOUT', 'Connection to the SMTP server timed out');
    });

    it('maps ESOCKET to TLS error message', async () => {
      await testErrorMapping('ESOCKET', 'TLS/SSL error');
    });

    it('maps ECONNRESET to connection reset message', async () => {
      await testErrorMapping('ECONNRESET', 'Connection to the SMTP server was reset');
    });

    it('maps EDNS to DNS resolution error message', async () => {
      await testErrorMapping('EDNS', 'DNS resolution failed');
    });

    it('maps EAI_AGAIN to temporary DNS failure message', async () => {
      await testErrorMapping('EAI_AGAIN', 'Temporary DNS resolution failure');
    });

    it('maps EENVELOPE to envelope error on sendMail', async () => {
      await testErrorMapping('EENVELOPE', 'Invalid envelope', 'sendMail');
    });

    it('maps EMESSAGE to message rejected on sendMail', async () => {
      await testErrorMapping('EMESSAGE', 'server rejected the message', 'sendMail');
    });

    it('maps 535 response code to auth error', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(
        jest.fn().mockRejectedValue(Object.assign(new Error('535 Auth failed'), { responseCode: 535 })),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('authentication failed'),
        }),
      );
    });

    it('maps auth-related error message to auth error', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(
        jest.fn().mockRejectedValue(new Error('Invalid login: Authentication unsuccessful')),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('authentication failed'),
        }),
      );
    });

    it('includes raw error message for unknown error codes', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(jest.fn().mockRejectedValue(new Error('Something unexpected happened')));

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Something unexpected happened'),
        }),
      );
    });

    it('prefixes verify errors with connection verification message', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(
        jest.fn().mockRejectedValue(Object.assign(new Error('fail'), { code: 'ECONNREFUSED' })),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('SMTP connection verification failed'),
        }),
      );
    });

    it('prefixes sendMail errors with test email message', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(
        jest.fn().mockResolvedValue(true),
        jest.fn().mockRejectedValue(new Error('Rejected by server')),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('sending a test email failed'),
        }),
      );
    });

    it('handles non-Error thrown values', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(jest.fn().mockRejectedValue('string error'));

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
    });
  });
}
