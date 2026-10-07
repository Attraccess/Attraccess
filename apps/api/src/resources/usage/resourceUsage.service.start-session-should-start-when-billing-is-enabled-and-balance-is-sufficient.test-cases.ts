import { Resource, ResourceUsage, ResourceType, ResourceUsageAction, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldStartWhenBillingIsEnabledAndBalanceIsSufficient(
  scope: StartSessionTestScope,
): void {
  it('should start when billing is enabled and balance is sufficient', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    const mockResource: Resource = {
      id: 1,
      name: 'Test Resource',
      allowTakeOver: false,
      type: ResourceType.Machine,
    } as Resource;

    scope.resourceRepository.findOne.mockResolvedValue(mockResource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    scope.billingService.handleResourceUsageStart.mockResolvedValue(undefined);

    const createdSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      isFinalized: false,
      user: { id: 1, billingFactor: 100 } as User,
    } as ResourceUsage;
    const finalizedSession = { ...createdSession, isFinalized: true };

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null) // For getActiveSession
      .mockResolvedValueOnce(createdSession) // For finding new session
      .mockResolvedValueOnce(finalizedSession) // For fetching finalized session to return
      .mockResolvedValueOnce(finalizedSession); // For emitUsageEvent

    const mockQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.startSession(1, { id: 1 } as User, dto);

    expect(result).toMatchObject({ id: 1, resourceId: 1, userId: 1, endTime: null, isFinalized: true });
    expect(scope.billingService.handleResourceUsageStart).toHaveBeenCalled();
    expect(mockQueryBuilder.insert).toHaveBeenCalled();
    expect(scope.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(scope.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
    expect(scope.mockAuditService.recordResource).toHaveBeenCalledWith({
      action: 'usage_session.started',
      actorId: 1,
      authenticationMethod: 'session',
      subjectId: 1,
      details: { usageId: 1, usageUserId: 1 },
    });
  });
}
