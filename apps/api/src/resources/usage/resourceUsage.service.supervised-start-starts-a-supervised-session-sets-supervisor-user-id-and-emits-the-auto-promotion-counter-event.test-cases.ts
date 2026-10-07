import { SupervisionMode } from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceSupervisedUsageStartedEvent } from './events/resource-usage.events';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartStartsASupervisedSessionSetsSupervisorUserIdAndEmitsTheAutoPromotionCounterEvent(
  scope: SupervisedStartTestScope,
): void {
  it('starts a supervised session, sets supervisorUserId, and emits the auto-promotion counter event', async () => {
    const dto: StartUsageSessionDto = { notes: 'Supervised run' };
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(scope.supervisor);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

    const { finalizedSession, mockQueryBuilder } = scope.mockSuccessfulSessionCreation(2);

    const result = await scope.service.startSession(1, scope.requester, dto, { supervisorUserId: 2 });

    expect(result).toEqual(finalizedSession);
    expect(mockQueryBuilder.values).toHaveBeenCalledWith(expect.objectContaining({ supervisorUserId: 2 }));

    const counterEmit = scope.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceSupervisedUsageStartedEvent.EVENT_NAME,
    );
    expect(counterEmit).toBeDefined();
    const payload = counterEmit?.[1] as ResourceSupervisedUsageStartedEvent;
    expect(payload).toBeInstanceOf(ResourceSupervisedUsageStartedEvent);
    expect(payload).toMatchObject({ resourceId: 1, userId: 1, supervisorUserId: 2 });
  });
}
