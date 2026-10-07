import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendUserRetrainingEmailCases(fixture: ReturnType<typeof registerEmailServiceFixture>) {
  describe('sendUserRetrainingEmail', () => {
    it('sets isAge=true for age reason', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(
        user,
        { id: 5, name: 'Printer', isGroup: false },
        {
          reason: 'age',
          blocksAccess: true,
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Age reason');
      expect(html).not.toContain('Inactivity reason');
      expect(html).toContain('Access blocked');
      expect(html).toContain('https://frontend.example/resources/5');
    });

    it('sets isInactivity=true for inactivity reason', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(
        user,
        { id: 3, name: 'Printer', isGroup: false },
        {
          reason: 'inactivity',
          blocksAccess: false,
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Inactivity reason');
      expect(html).not.toContain('Age reason');
      expect(html).not.toContain('Access blocked');
    });

    it('sets both flags false for null reason', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'bob@example.com' });

      await service.sendUserRetrainingEmail(
        user,
        { id: 3, name: 'Printer', isGroup: false },
        {
          reason: null,
          blocksAccess: false,
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Default reason');
    });
  });
}
