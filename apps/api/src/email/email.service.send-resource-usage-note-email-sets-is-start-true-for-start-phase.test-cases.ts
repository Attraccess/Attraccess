import { SendResourceUsageNoteEmailTestScope } from './email.service.spec';
export function registerSendResourceUsageNoteEmailSetsIsStartTrueForStartPhase(
  scope: SendResourceUsageNoteEmailTestScope,
): void {
  it('sets isStart=true for start phase', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'carol@example.com' });

    await service.sendResourceUsageNoteEmail(
      user,
      { id: 7, name: 'CNC' },
      {
        content: 'Blade worn',
        phase: 'start',
        authorName: 'alice',
      },
    );

    const { html } = (sendMail as jest.Mock).mock.calls[0][0];
    expect(html).toContain('Start note');
    expect(html).not.toContain('End note');
    expect(html).toContain('Blade worn');
    expect(html).toContain('alice');
  });
}
