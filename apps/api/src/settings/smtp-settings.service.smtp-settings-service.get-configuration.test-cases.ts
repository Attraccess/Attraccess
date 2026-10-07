import { BadRequestException } from '@nestjs/common';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerGetConfigurationCases(fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>) {
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
}
