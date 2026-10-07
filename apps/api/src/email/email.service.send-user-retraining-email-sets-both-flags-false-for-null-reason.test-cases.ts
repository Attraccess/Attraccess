import { SendUserRetrainingEmailTestScope } from './email.service.spec';
export function registerSendUserRetrainingEmailSetsBothFlagsFalseForNullReason(
  scope: SendUserRetrainingEmailTestScope,
): void {
  it('sets both flags false for null reason', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'bob@example.com' });

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
}
