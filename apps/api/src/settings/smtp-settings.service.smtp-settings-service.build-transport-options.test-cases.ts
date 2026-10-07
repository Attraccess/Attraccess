import { SmtpServiceType } from './dto/smtp-settings.dto';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerBuildTransportOptionsCases(fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>) {
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
}
