import { SendResourceHealthChangedEmailTestScope } from './email.service.spec';
export function registerSendResourceHealthChangedEmailPassesIsDegradedFalseForHealthyStatus(
  scope: SendResourceHealthChangedEmailTestScope,
): void {
  it('passes isDegraded=false for healthy status', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'alice@example.com' });

    await service.sendResourceHealthChangedEmail(
      user,
      { id: 2, name: 'Laser Cutter' },
      {
        status: 'healthy' as never,
        previousStatus: 'unhealthy' as never,
        reason: null,
        identifier: 'laser.temperature',
      },
    );

    const { html } = (sendMail as jest.Mock).mock.calls[0][0];
    expect(html).toContain('Recovered');
    expect(html).not.toContain('Degraded');
  });
}
