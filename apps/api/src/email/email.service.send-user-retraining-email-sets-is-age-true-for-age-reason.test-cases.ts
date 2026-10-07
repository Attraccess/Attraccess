import { SendUserRetrainingEmailTestScope } from './email.service.spec';
export function registerSendUserRetrainingEmailSetsIsAgeTrueForAgeReason(
  scope: SendUserRetrainingEmailTestScope,
): void {
  it('sets isAge=true for age reason', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'bob@example.com' });

    await service.sendUserRetrainingEmail(
      user,
      { id: 5, name: 'Printer', isGroup: false },
      {
        reason: 'age',
        blocksAccess: true,
      },
    );

    const { html } = (sendMail as jest.Mock).mock.calls[0][0];
    expect(html).toContain('Age reason');
    expect(html).not.toContain('Inactivity reason');
    expect(html).toContain('Access blocked');
    expect(html).toContain('https://frontend.example/resources/5');
  });
}
