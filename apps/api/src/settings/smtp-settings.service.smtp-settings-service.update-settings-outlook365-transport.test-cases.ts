import { createTransport } from 'nodemailer';
import { SmtpServiceType } from './dto/smtp-settings.dto';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerUpdateSettingsOutlook365TransportCases(
  fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>,
) {
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
}
