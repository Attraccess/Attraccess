import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendsAccessChangeEmailWithTitleBodyAndResolvedUrlCases(
  fixture: ReturnType<typeof registerEmailServiceFixture>,
) {
  it('sends access change email with title, body and resolved URL', async () => {
    const { service, sendMail } = fixture.setup();
    const user = fixture.makeUser({ username: 'dana', email: 'dana@example.com' });

    await service.sendAccessChangeEmail(user, {
      title: 'Your resource access changed',
      body: 'You were made an introducer for resource #7.',
      url: '/resources/7',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('dana@example.com');
    expect(callArg.subject).toBe('Your resource access changed');
    expect(callArg.html).toContain('Hello dana');
    expect(callArg.html).toContain('You were made an introducer for resource #7.');
    expect(callArg.html).toContain('https://frontend.example/resources/7');
  });
}
