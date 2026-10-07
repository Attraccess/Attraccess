import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { ResourceUsageSessionEndedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionEmitsASystemResourceSessionEndedNotificationEventForFlowEndedSessions(
  scope: EndSessionTestScope,
): void {
  it('emits a system resource session ended notification event for flow-ended sessions', async () => {
    const owner = { id: 77, username: 'member' } as User;
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: owner.id,
      startTime: new Date(),
      user: owner,
      resource: { id: 12, name: 'Laser cutter' } as Resource,
    } as ResourceUsage;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: 'Flow stop',
    };

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await scope.service.endSession(
      mockActiveSession.resourceId,
      owner,
      { notes: 'Flow stop' },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );

    const endedEmit = scope.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeDefined();
    const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
    expect(payload.usage).toBe(mockUpdatedSession);
    expect(payload.endedBy).toBeNull();
  });
}
