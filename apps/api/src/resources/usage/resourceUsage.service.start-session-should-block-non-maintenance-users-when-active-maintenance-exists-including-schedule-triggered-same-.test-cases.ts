import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldBlockNonMaintenanceUsersWhenActiveMaintenanceExistsIncludingScheduleTriggeredSame(
  scope: StartSessionTestScope,
): void {
  it('should block non-maintenance users when active maintenance exists including schedule-triggered (same as manual)', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    scope.resourceRepository.findOne.mockResolvedValue(scope.mockResource);
    // hasActiveMaintenance does not filter by origin: schedule-created maintenances use the same
    // table and criteria (startTime <= now, endTime IS NULL), so they block the same as manual ones
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
