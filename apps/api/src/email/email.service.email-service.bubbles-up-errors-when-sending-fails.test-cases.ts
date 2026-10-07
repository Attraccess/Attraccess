import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerBubblesUpErrorsWhenSendingFailsCases(fixture: ReturnType<typeof registerEmailServiceFixture>) {
  it('bubbles up errors when sending fails', async () => {
    const { service, sendMail } = fixture.setup();
    (sendMail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const user = fixture.makeUser();

    await expect(service.sendVerificationEmail(user, 'tok')).rejects.toThrow('SMTP down');
  });
}
