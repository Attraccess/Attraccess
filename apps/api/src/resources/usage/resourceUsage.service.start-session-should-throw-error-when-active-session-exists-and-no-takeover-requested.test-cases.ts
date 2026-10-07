import { ResourceUsage, User } from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldThrowErrorWhenActiveSessionExistsAndNoTakeoverRequested(
  scope: StartSessionTestScope,
): void {
  it('should throw error when active session exists and no takeover requested', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    const mockActiveSession = { id: 1, userId: 2, user: { id: 2 } as User } as ResourceUsage;
    // Mock getActiveSession to return an active session
    scope.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toBeInstanceOf(ResourceInUseError);
  });
}
