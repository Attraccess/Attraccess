import { ResourceUsageNoteAddedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionDoesNotEmitTheNoteEventWhenSkipNoteNotificationIsSetFlowEndedSession(
  scope: EndSessionTestScope,
): void {
  it('does not emit the note event when skipNoteNotification is set (flow-ended session)', async () => {
    scope.setupEndSession();

    await scope.service.endSession(1, scope.mockUser, { notes: 'auto note' }, { skipNoteNotification: true });

    const noteEmit = scope.eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME);
    expect(noteEmit).toBeUndefined();
  });
}
