import { SendResourceUsageNoteEmailTestScope } from './email.service.spec';
export function registerSendResourceUsageNoteEmailSetsIsStartFalseForEndPhase(
  scope: SendResourceUsageNoteEmailTestScope,
): void {
  it('sets isStart=false for end phase', async () => {
    const { service, sendMail } = scope.setup();
    const user = scope.makeUser({ email: 'carol@example.com' });

    await service.sendResourceUsageNoteEmail(
      user,
      { id: 7, name: 'CNC' },
      {
        content: 'All good',
        phase: 'end',
        authorName: 'bob',
      },
    );

    const { html } = (sendMail as jest.Mock).mock.calls[0][0];
    expect(html).toContain('End note');
    expect(html).not.toContain('Start note');
  });
}
