import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionAllowsUsersWithResourcesUpdatePermissionToEndSessionsOwnedByOthers(
  scope: EndSessionTestScope,
): void {
  it('allows users with resources.update permission to end sessions owned by others', async () => {
    const dto: EndUsageSessionDto = { notes: 'Manual stop' };
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
    } as ResourceUsage;
    const prefixedNotes = `[By #${managerUser.id} - ${managerUser.username}] ${dto.notes}`;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: prefixedNotes,
    };

    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.endSession(mockActiveSession.resourceId, managerUser, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(scope.resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
    expect(scope.transactionalEntityManager.update).toHaveBeenCalled();
    expect(scope.billingService.chargeForResourceUsage).toHaveBeenCalledWith(
      mockUpdatedSession,
      scope.transactionalEntityManager,
    );
    expect(scope.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
