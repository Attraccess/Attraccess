import { Resource } from '@attraccess/database-entities';
import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerSendsResourceSessionEndedEmailWithResourceUrlAndActorContextCases(
  fixture: ReturnType<typeof registerEmailServiceFixture>,
) {
  it('sends resource session ended email with resource URL and actor context', async () => {
    const { service, sendMail } = fixture.setup();
    const user = fixture.makeUser({ id: 7, username: 'dana', email: 'dana@example.com' });

    await service.sendResourceSessionEndedEmail(user, { id: 3, name: 'Laser Cutter' } as Resource, {
      id: 99,
      endedAt: new Date('2026-01-01T12:00:00.000Z'),
      endedBy: 'alice',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('dana@example.com');
    expect(callArg.subject).toBe('Laser Cutter session ended');
    expect(callArg.html).toContain('Hello dana');
    expect(callArg.html).toContain('alice ended your session on Laser Cutter');
    expect(callArg.html).toContain('https://frontend.example/resources/3');
  });
}
