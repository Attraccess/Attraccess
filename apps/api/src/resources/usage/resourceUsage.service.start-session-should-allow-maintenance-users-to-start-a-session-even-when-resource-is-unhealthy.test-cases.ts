import { ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldAllowMaintenanceUsersToStartASessionEvenWhenResourceIsUnhealthy(
  scope: StartSessionTestScope,
): void {
  it('should allow maintenance users to start a session even when resource is unhealthy', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
    scope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdSession)
      .mockResolvedValueOnce(finalizedSession)
      .mockResolvedValueOnce(finalizedSession);

    const mockQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.startSession(1, scope.mockUser, dto);
    expect(result).toEqual(finalizedSession);
  });
}
