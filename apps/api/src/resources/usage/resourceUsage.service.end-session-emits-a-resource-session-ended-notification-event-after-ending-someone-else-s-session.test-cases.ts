import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceUsageSessionEndedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionEmitsAResourceSessionEndedNotificationEventAfterEndingSomeoneElseSSession(
  scope: EndSessionTestScope,
): void {
  it("emits a resource session ended notification event after ending someone else's session", async () => {
    const dto: EndUsageSessionDto = { notes: 'Manager stop' };
    const sessionOwner = { id: 77, username: 'member' } as User;
    const managerUser = {
      id: 88,
      username: 'manager',
    } as User;
    scope.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
      resource: { id: 12, name: 'Laser cutter' } as Resource,
    } as ResourceUsage;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: `[By #${managerUser.id} - ${managerUser.username}] ${dto.notes}`,
    };

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await scope.service.endSession(mockActiveSession.resourceId, managerUser, dto);

    const endedEmit = scope.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeDefined();
    const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
    expect(payload).toBeInstanceOf(ResourceUsageSessionEndedEvent);
    expect(payload.usage).toBe(mockUpdatedSession);
    expect(payload.endedBy).toEqual({ id: managerUser.id, username: managerUser.username });
  });
}
