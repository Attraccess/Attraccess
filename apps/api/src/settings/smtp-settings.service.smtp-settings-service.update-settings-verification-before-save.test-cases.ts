import { BadRequestException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerUpdateSettingsVerificationBeforeSaveCases(
  fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>,
) {
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
}
