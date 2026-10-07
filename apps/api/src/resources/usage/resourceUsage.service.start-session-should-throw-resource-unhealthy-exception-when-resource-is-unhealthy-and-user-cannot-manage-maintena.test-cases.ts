import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldThrowResourceUnhealthyExceptionWhenResourceIsUnhealthyAndUserCannotManageMaintena(
  scope: StartSessionTestScope,
): void {
  it('should throw ResourceUnhealthyException when resource is unhealthy and user cannot manage maintenance', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.mockResourceHealthService.isResourceUnhealthy.mockResolvedValueOnce(true);
    scope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

    const { ResourceUnhealthyException } = require('../../exceptions/resource.unhealthy.exception');

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toBeInstanceOf(ResourceUnhealthyException);
    expect(scope.mockResourceHealthService.isResourceUnhealthy).toHaveBeenCalledWith(1);
    expect(scope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalled();
  });
}
