import { ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceSupervisedUsageEndedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionEmitsTheAutoPromotionCounterEventWhenASupervisedSessionEnds(
  scope: EndSessionTestScope,
): void {
  it('emits the auto-promotion counter event when a supervised session ends', async () => {
    const dto: EndUsageSessionDto = {};
    const sessionOwner = { id: 60, username: 'student' } as User;
    const supervisorUser = { id: 61, username: 'supervisor' } as User;
    const mockActiveSession = {
      id: 9,
      resourceId: 40,
      userId: sessionOwner.id,
      supervisorUserId: supervisorUser.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date() };

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      scope.createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await scope.service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

    const endedEmit = scope.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeDefined();
    const payload = endedEmit?.[1] as ResourceSupervisedUsageEndedEvent;
    expect(payload).toBeInstanceOf(ResourceSupervisedUsageEndedEvent);
    expect(payload).toMatchObject({ resourceId: 40, userId: 60, supervisorUserId: 61, usageId: 9 });
  });
}
