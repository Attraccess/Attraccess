import { SendResourceHealthChangedEmailTestScope } from './email.service.spec';
export function registerSendResourceHealthChangedEmailPassesIsDegradedTrueAndHeaderColorForUnhealthyStatus(
  scope: SendResourceHealthChangedEmailTestScope,
): void {
  it('passes isDegraded=true and headerColor for unhealthy status', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'alice@example.com' });

    await service.sendResourceHealthChangedEmail(
      user,
      { id: 1, name: 'Laser Cutter' },
      {
        status: 'unhealthy' as never,
        previousStatus: 'healthy' as never,
        reason: 'sensor offline',
        identifier: 'laser.temperature',
      },
    );

    const { html } = (sendMail as jest.Mock).mock.calls[0][0];
    expect(html).toContain('Degraded');
    expect(html).not.toContain('Recovered');
    expect(html).toContain('unhealthy');
    expect(html).toContain('https://frontend.example/resources/1');
  });
}
