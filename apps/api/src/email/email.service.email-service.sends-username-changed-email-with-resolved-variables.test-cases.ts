import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendsUsernameChangedEmailWithResolvedVariablesCases(
  fixture: ReturnType<typeof registerEmailServiceFixture>,
) {
  it('sends username changed email with resolved variables', async () => {
    const { service, sendMail } = fixture.setup();
    const user = fixture.makeUser({ username: 'alice' });

    await service.sendUsernameChangedEmail(user, 'old_alice');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('alice@example.com');
    expect(callArg.subject).toBe('Username changed for alice');
    expect(callArg.html).toContain('Hello alice');
    expect(callArg.html).toContain('old_alice');
    expect(callArg.html).toContain('alice'); // newUsername also equals current username
    // host.frontend and host.backend both resolve to the single app URL
    expect(callArg.html).toContain('https://frontend.example');
    expect(callArg.attachments).toEqual([
      expect.objectContaining({
        filename: 'logo.png',
        contentType: 'image/png',
        cid: 'attraccess-logo',
        path: expect.stringMatching(/assets\/logo\.png$/),
      }),
    ]);
    expect(callArg.html).toContain('cid:attraccess-logo');
  });
}
