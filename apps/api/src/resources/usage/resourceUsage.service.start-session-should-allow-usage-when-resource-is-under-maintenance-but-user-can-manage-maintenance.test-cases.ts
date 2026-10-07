import { ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldAllowUsageWhenResourceIsUnderMaintenanceButUserCanManageMaintenance(
  scope: StartSessionTestScope,
): void {
  it('should allow usage when resource is under maintenance but user can manage maintenance', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);

    // Mock maintenance service to indicate active maintenance but user can manage
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
    scope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(true);

    // Mock other required services
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

    // Mock getActiveSession to return null (no active session)
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(null) // For getActiveSession
      .mockResolvedValueOnce(createdSession) // For finding new session
      .mockResolvedValueOnce(finalizedSession) // Fetch finalized session for return
      .mockResolvedValueOnce(finalizedSession); // Emit event after commit

    const mockQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.startSession(1, scope.mockUser, dto);

    expect(result).toEqual(finalizedSession);
    expect(scope.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
    expect(scope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
      scope.mockUser,
      1,
      expect.anything(),
    );
    expect(scope.flowExecutorService.trackResourceActivity).toHaveBeenCalledWith(createdSession.resourceId);
  });
}
