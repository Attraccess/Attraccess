import { BadRequestException } from '@nestjs/common';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldThrowErrorWhenUserHasNotCompletedIntroduction(
  scope: StartSessionTestScope,
): void {
  it('should throw error when user has not completed introduction', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toThrow(BadRequestException);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledWith(1, 1, expect.anything());
  });
}
