import { EmailServiceTestScope } from './email.service.spec';
export function registerEmailServiceSendsResourceTakeoverEmailWithExpectedContext(scope: EmailServiceTestScope): void {
  it('sends resource takeover email with expected context', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ id: 2, username: 'bob', email: 'bob@example.com' });

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
