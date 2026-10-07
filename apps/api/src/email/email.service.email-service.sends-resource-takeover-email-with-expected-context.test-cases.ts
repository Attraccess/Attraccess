import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendsResourceTakeoverEmailWithExpectedContextCases(
  fixture: ReturnType<typeof registerEmailServiceFixture>,
) {
  it('sends resource takeover email with expected context', async () => {
    const { service, sendMail } = fixture.setup();
    const user = fixture.makeUser({ id: 2, username: 'bob', email: 'bob@example.com' });

    await service.sendResourceTakeoverEmail(user, { id: 4, name: 'Laser Cutter' }, { actorName: 'alice' });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('bob@example.com');
    expect(callArg.subject).toBe('Laser Cutter was taken over');
    expect(callArg.html).toContain('Hello bob');
    expect(callArg.html).toContain('alice took over Laser Cutter');
    expect(callArg.html).toContain('https://frontend.example/resources/4');
  });
}
