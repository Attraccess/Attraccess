import { SmtpServiceType } from './dto/smtp-settings.dto';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerGetSettingsCases(fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>) {
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
}
