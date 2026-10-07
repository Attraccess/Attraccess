import { SendResourceHealthChangedEmailTestScope } from './email.service.spec';
export function registerSendResourceHealthChangedEmailSkipsSendWhenUserHasNoEmail(
  scope: SendResourceHealthChangedEmailTestScope,
): void {
  it('skips send when user has no email', async () => {
    const { service, sendMail } = scope.setup();
    await service.sendResourceHealthChangedEmail(
      { email: null } as never,
      { id: 1, name: 'X' },
      {
        status: 'unhealthy' as never,
        previousStatus: null,
        reason: null,
        identifier: 'x',
      },
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
}
