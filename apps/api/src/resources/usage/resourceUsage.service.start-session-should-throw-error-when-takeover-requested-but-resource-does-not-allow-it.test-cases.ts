import { ResourceUsage, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldThrowErrorWhenTakeoverRequestedButResourceDoesNotAllowIt(
  scope: StartSessionTestScope,
): void {
  it('should throw error when takeover requested but resource does not allow it', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

    // Mock resourceRepository.findOne to return the resource (allowTakeOver: false)
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

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toThrow(
      new BadRequestException('This resource does not allow overtaking'),
    );
  });
}
