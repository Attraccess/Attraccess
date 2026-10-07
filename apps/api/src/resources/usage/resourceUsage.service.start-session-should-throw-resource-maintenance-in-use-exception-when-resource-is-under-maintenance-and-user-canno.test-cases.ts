import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldThrowResourceMaintenanceInUseExceptionWhenResourceIsUnderMaintenanceAndUserCanno(
  scope: StartSessionTestScope,
): void {
  it('should throw ResourceMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    // Mock resourceRepository.findOne to return the resource
    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);

    // Mock maintenance service to indicate active maintenance
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(true);
    scope.resourceMaintenanceService.canManageMaintenance.mockResolvedValue(false);

    await expect(scope.service.startSession(1, scope.mockUser, dto)).rejects.toThrow(
      ResourceUsageImpossibleMaintenanceInProgressException,
    );
    expect(scope.resourceMaintenanceService.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
    expect(scope.resourceMaintenanceService.canManageMaintenance).toHaveBeenCalledWith(
      scope.mockUser,
      1,
      expect.anything(),
    );
  });
}
