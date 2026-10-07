import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendResourceUsageNoteEmailCases(fixture: ReturnType<typeof registerEmailServiceFixture>) {
  describe('sendResourceUsageNoteEmail', () => {
    it('sets isStart=true for start phase', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'carol@example.com' });

      await service.sendResourceUsageNoteEmail(
        user,
        { id: 7, name: 'CNC' },
        {
          content: 'Blade worn',
          phase: 'start',
          authorName: 'alice',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Start note');
      expect(html).not.toContain('End note');
      expect(html).toContain('Blade worn');
      expect(html).toContain('alice');
    });

    it('sets isStart=false for end phase', async () => {
      const { service, sendMail } = fixture.setup();
      const user = fixture.makeUser({ email: 'carol@example.com' });

      await service.sendResourceUsageNoteEmail(
        user,
        { id: 7, name: 'CNC' },
        {
          content: 'All good',
          phase: 'end',
          authorName: 'bob',
        },
      );

      const { html } = (sendMail as jest.Mock).mock.calls[0][0];
      expect(html).toContain('End note');
      expect(html).not.toContain('Start note');
    });
  });
}
