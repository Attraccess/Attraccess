import { ResourceUsageNoteAddedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionEmitsResourceUsageNoteAddedEventWhenAUserNoteIsPresent(
  scope: EndSessionTestScope,
): void {
  it('emits ResourceUsageNoteAddedEvent when a user note is present', async () => {
    scope.setupEndSession();

    await scope.service.endSession(1, scope.mockUser, { notes: 'note text' });

    const noteEmit = scope.eventEmitter.emit.mock.calls.find((c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME);
    expect(noteEmit).toBeDefined();
    const payload = noteEmit?.[1] as ResourceUsageNoteAddedEvent;
    expect(payload).toMatchObject({ resourceId: 1, note: 'note text', phase: 'end' });
  });
}
