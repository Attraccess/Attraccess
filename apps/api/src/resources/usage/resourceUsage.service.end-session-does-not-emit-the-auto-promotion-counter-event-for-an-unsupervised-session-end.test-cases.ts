import { ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceSupervisedUsageEndedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionDoesNotEmitTheAutoPromotionCounterEventForAnUnsupervisedSessionEnd(
  scope: EndSessionTestScope,
): void {
  it('does not emit the auto-promotion counter event for an unsupervised session end', async () => {
    const dto: EndUsageSessionDto = {};
    const sessionOwner = { id: 60, username: 'student' } as User;
    const mockActiveSession = {
      id: 9,
      resourceId: 40,
      userId: sessionOwner.id,
      supervisorUserId: null,
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

    await scope.service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

    const endedEmit = scope.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeUndefined();
  });
}
