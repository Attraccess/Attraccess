import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { BadRequestException } from '@nestjs/common';
import { createTransport } from 'nodemailer';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
describe('SmtpSettingsService', () => {
  const fixture = registerSmtpSettingsServiceFixture();

  describe('buildTransportOptions', () => {
    it('builds options for SMTP service with all fields', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig();
      const options = service.buildTransportOptions(config);

      expect(options).toEqual({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' },
      });
    });

    it('builds options for Outlook365 service', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig({ service: SmtpServiceType.Outlook365 });
      const options = service.buildTransportOptions(config);

      expect(options).toEqual({
        service: 'Outlook365',
        auth: { user: 'user@example.com', pass: 'secret' },
      });
    });

    it('omits auth when no user and no pass', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig({ user: null, pass: null });
      const options = service.buildTransportOptions(config);

      expect(options.auth).toBeUndefined();
    });

    it('includes auth when only user is set', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig({ pass: null });
      const options = service.buildTransportOptions(config);

      expect(options.auth).toEqual({ user: 'user@example.com', pass: '' });
    });

    it('includes auth when only pass is set', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig({ user: null });
      const options = service.buildTransportOptions(config);

      expect(options.auth).toEqual({ user: '', pass: 'secret' });
    });

    it('defaults secure to false when null', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig({ service: SmtpServiceType.SMTP, secure: null });
      const options = service.buildTransportOptions(config);

      expect(options).toHaveProperty('secure', false);
    });

    it('passes undefined for null host and port', () => {
      const { service } = fixture.setupService();
      const config = fixture.makeSmtpConfig({ host: null, port: null });
      const options = service.buildTransportOptions(config);

      expect(options).toHaveProperty('host', undefined);
      expect(options).toHaveProperty('port', undefined);
    });
  });

  describe('updateSettings - verification before save', () => {
    it('verifies SMTP connection and sends test email before saving', async () => {
      const { service, store } = fixture.setupService();
      const config = fixture.makeSmtpConfig();
      fixture.configureStoreWithSmtp(store, config);
      const { verify, sendMail } = fixture.setupMockTransporter();

      await service.updateSettings(fixture.makeUpdateDto());

      expect(verify).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'no-reply@example.com',
          to: 'no-reply@example.com',
          subject: 'Attraccess SMTP Configuration Test',
        }),
      );
      expect(store.setPlainSetting).toHaveBeenCalled();
    });

    it('does not save settings when verify() fails', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(
        jest.fn().mockRejectedValue(Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' })),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
      expect(store.setPlainSetting).not.toHaveBeenCalled();
      expect(store.setSecretSetting).not.toHaveBeenCalled();
    });

    it('does not save settings when sendMail() fails', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter(
        jest.fn().mockResolvedValue(true),
        jest.fn().mockRejectedValue(new Error('Rejected')),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
      expect(store.setPlainSetting).not.toHaveBeenCalled();
    });

    it('merges update DTO with current settings for password retention', async () => {
      const { service, store } = fixture.setupService();
      const existingConfig = fixture.makeSmtpConfig({ pass: 'existing-pass', passConfigured: true });
      fixture.configureStoreWithSmtp(store, existingConfig);
      const { sendMail } = fixture.setupMockTransporter();

      const updateWithoutPass = fixture.makeUpdateDto();
      delete (updateWithoutPass as unknown as Record<string, unknown>)['pass'];

      await service.updateSettings(updateWithoutPass);

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({ pass: 'existing-pass' }),
        }),
      );
    });

    it('uses new from address for test email when from is updated', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ from: 'old@example.com' }));
      const { sendMail } = fixture.setupMockTransporter();

      await service.updateSettings(fixture.makeUpdateDto({ from: 'new@example.com' }));

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'new@example.com',
          to: 'new@example.com',
        }),
      );
    });

    it('closes transporter after successful test', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      const { close } = fixture.setupMockTransporter();

      await service.updateSettings(fixture.makeUpdateDto());

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes transporter after failed sendMail', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      const { close } = fixture.setupMockTransporter(
        jest.fn().mockResolvedValue(true),
        jest.fn().mockRejectedValue(new Error('Send failed')),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes transporter after failed verify', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      const { close } = fixture.setupMockTransporter(
        jest.fn().mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })),
      );

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('verifies and saves without auth when user and pass are null', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ user: null, pass: null, passConfigured: false }));
      const { verify, sendMail } = fixture.setupMockTransporter();

      const dto = fixture.makeUpdateDto();
      delete (dto as unknown as Record<string, unknown>)['user'];
      delete (dto as unknown as Record<string, unknown>)['pass'];

      await service.updateSettings(dto);

      expect(verify).toHaveBeenCalledTimes(1);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledWith(expect.not.objectContaining({ auth: expect.anything() }));
      expect(store.setPlainSetting).toHaveBeenCalled();
    });

    it('omits auth when user is explicitly null in update', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ user: null, pass: null, passConfigured: false }));
      fixture.setupMockTransporter();

      await service.updateSettings(fixture.makeUpdateDto({ user: null, pass: null }));

      expect(createTransport).toHaveBeenCalledWith(expect.not.objectContaining({ auth: expect.anything() }));
    });

    it('persists all settings after successful verification', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());
      fixture.setupMockTransporter();

      await service.updateSettings(fixture.makeUpdateDto({ secure: true, pass: 'new-pass' }));

      expect(store.setPlainSetting).toHaveBeenCalledWith('smtp', 'service', SmtpServiceType.SMTP);
      expect(store.setPlainSetting).toHaveBeenCalledWith('smtp', 'host', 'smtp.example.com');
      expect(store.setPlainSetting).toHaveBeenCalledWith('smtp', 'port', '587');
      expect(store.setPlainSetting).toHaveBeenCalledWith('smtp', 'secure', 'true');
      expect(store.setPlainSetting).toHaveBeenCalledWith('smtp', 'user', 'user@example.com');
      expect(store.setSecretSetting).toHaveBeenCalledWith('smtp', 'pass', 'new-pass');
      expect(store.setPlainSetting).toHaveBeenCalledWith('smtp', 'from', 'no-reply@example.com');
    });
  });

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

  describe('updateSettings - verify timeout', () => {
    it('throws when SMTP verify times out', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());

      fixture.setupMockTransporter(jest.fn().mockRejectedValue(new Error('SMTP verification timed out')));

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(/timed out/i);
    });
  });

  describe('updateSettings - Outlook365 transport', () => {
    it('creates Outlook365 transport options when service is Outlook365', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ service: SmtpServiceType.Outlook365 }));
      fixture.setupMockTransporter();

      await service.updateSettings(fixture.makeUpdateDto({ service: SmtpServiceType.Outlook365 }));

      expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ service: 'Outlook365' }));
      expect(createTransport).not.toHaveBeenCalledWith(expect.objectContaining({ host: expect.anything() }));
    });
  });

  describe('getSettings', () => {
    it('returns current SMTP settings without password', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());

      const result = await service.getSettings();

      expect(result).toEqual({
        service: SmtpServiceType.SMTP,
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'user@example.com',
        from: 'no-reply@example.com',
        passConfigured: true,
      });
    });

    it('returns passConfigured false when no password set', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ pass: null, passConfigured: false }));

      const result = await service.getSettings();

      expect(result.passConfigured).toBe(false);
    });
  });

  describe('getConfiguration', () => {
    it('returns null when no service configured', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ service: null }));

      const result = await service.getConfiguration();

      expect(result).toBeNull();
    });

    it('throws when SMTP service missing host', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ host: null }));

      await expect(service.getConfiguration()).rejects.toThrow(BadRequestException);
    });

    it('throws when SMTP service missing port', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ port: null }));

      await expect(service.getConfiguration()).rejects.toThrow(BadRequestException);
    });

    it('throws when SMTP service missing from', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ from: null }));

      await expect(service.getConfiguration()).rejects.toThrow(BadRequestException);
    });

    it('throws when Outlook365 service missing from', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(
        store,
        fixture.makeSmtpConfig({ service: SmtpServiceType.Outlook365, from: null }),
      );

      await expect(service.getConfiguration()).rejects.toThrow(BadRequestException);
    });

    it('throws when pass set without user', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig({ user: null, pass: 'secret' }));

      await expect(service.getConfiguration()).rejects.toThrow(BadRequestException);
    });

    it('returns full config when valid', async () => {
      const { service, store } = fixture.setupService();
      const config = fixture.makeSmtpConfig();
      fixture.configureStoreWithSmtp(store, config);

      const result = await service.getConfiguration();

      expect(result).toEqual(config);
    });
  });
});
