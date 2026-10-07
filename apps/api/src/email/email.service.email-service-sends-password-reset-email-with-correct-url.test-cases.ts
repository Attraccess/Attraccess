import { EmailServiceTestScope } from './email.service.spec';
export function registerEmailServiceSendsPasswordResetEmailWithCorrectUrl(scope: EmailServiceTestScope): void {
  it('sends password reset email with correct URL', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ id: 42, email: 'charlie@example.com' });
    const token = 'reset-token-XYZ';

    await service.sendPasswordResetEmail(user, token);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = (sendMail as jest.Mock).mock.calls[0][0];
    expect(callArg.to).toBe('charlie@example.com');
    expect(callArg.subject).toContain('Reset password for charlie@example.com');
    expect(callArg.html).toMatch(
      /https:\/\/frontend\.example\/reset-password\?userId(?:=|&#x3D;)42(?:&|&amp;)token(?:=|&#x3D;)reset-token-XYZ/,
    );
  });
}
