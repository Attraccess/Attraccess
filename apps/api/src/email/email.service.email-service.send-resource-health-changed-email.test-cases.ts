import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendResourceHealthChangedEmailCases(fixture: ReturnType<typeof registerEmailServiceFixture>) {
  describe('sendResourceHealthChangedEmail', () => {
    it('passes isDegraded=true and headerColor for unhealthy status', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'alice@example.com' });

      await service.sendResourceHealthChangedEmail(
        user,
        { id: 1, name: 'Laser Cutter' },
        {
          status: 'unhealthy' as never,
          previousStatus: 'healthy' as never,
          reason: 'sensor offline',
          identifier: 'laser.temperature',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Degraded');
      expect(html).not.toContain('Recovered');
      expect(html).toContain('unhealthy');
      expect(html).toContain('https://frontend.example/resources/1');
    });

    it('passes isDegraded=false for healthy status', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'alice@example.com' });

      await service.sendResourceHealthChangedEmail(
        user,
        { id: 2, name: 'Laser Cutter' },
        {
          status: 'healthy' as never,
          previousStatus: 'unhealthy' as never,
          reason: null,
          identifier: 'laser.temperature',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Recovered');
      expect(html).not.toContain('Degraded');
    });

    it('skips send when user has no email', async () => {
      const { service, sendMail } = fixture.setup();
      await service.sendResourceHealthChangedEmail(
        { email: null } as never,
        { id: 1, name: 'X' },
        {
          status: 'unhealthy' as never,
          previousStatus: null,
          reason: null,
          identifier: 'x',
        },
      );
      expect(sendMail).not.toHaveBeenCalled();
    });
  });
}
