import { BadRequestException } from '@nestjs/common';
import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerUpdateSettingsVerifyTimeoutCases(
  fixture: ReturnType<typeof registerSmtpSettingsServiceFixture>,
) {
  describe('updateSettings - verify timeout', () => {
    it('throws when SMTP verify times out', async () => {
      const { service, store } = fixture.setupService();
      fixture.configureStoreWithSmtp(store, fixture.makeSmtpConfig());

      fixture.setupMockTransporter(jest.fn().mockRejectedValue(new Error('SMTP verification timed out')));

      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(BadRequestException);
      await expect(service.updateSettings(fixture.makeUpdateDto())).rejects.toThrow(/timed out/i);
    });
  });
}
