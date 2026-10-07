import { SendUserRetrainingEmailTestScope } from './email.service.spec';
export function registerSendUserRetrainingEmailSetsIsInactivityTrueForInactivityReason(
  scope: SendUserRetrainingEmailTestScope,
): void {
  it('sets isInactivity=true for inactivity reason', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'bob@example.com' });

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
}
