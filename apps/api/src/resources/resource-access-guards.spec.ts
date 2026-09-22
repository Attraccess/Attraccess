import { BadRequestException, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { CanManageMaintenanceGuard } from './maintenances/canManageMaintenance.guard';
import type { ResourceMaintenanceService } from './maintenances/maintenance.service';
import { IsResourceIntroducerGuard } from './introductions/isIntroducerGuard';
import type { ResourceIntroducersService } from './introducers/resourceIntroducers.service';
const maintenance = { canManageMaintenance: jest.fn() },
  introductions = { isIntroducer: jest.fn() };
const maintenanceGuard = new CanManageMaintenanceGuard(maintenance as unknown as ResourceMaintenanceService);
const introducerGuard = new IsResourceIntroducerGuard(introductions as unknown as ResourceIntroducersService);
function context(user: unknown, resourceId?: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user, params: { resourceId } }) }) } as ExecutionContext;
}
beforeEach(() => {
  jest.resetAllMocks();
});
it.each([maintenanceGuard, introducerGuard])(
  'requires authentication and a valid resource before consulting access services',
  async (guard) => {
    await expect(guard.canActivate(context(null, '7'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(context({ id: 3 }))).resolves.toBe(false);
    await expect(guard.canActivate(context({ id: 3 }, 'bad'))).rejects.toBeInstanceOf(BadRequestException);
    expect(maintenance.canManageMaintenance).not.toHaveBeenCalled();
    expect(introductions.isIntroducer).not.toHaveBeenCalled();
  },
);
it('uses maintenance-specific permissions and fails closed when the access lookup fails', async () => {
  maintenance.canManageMaintenance
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error('Unavailable'));
  const user = { id: 3 };
  await expect(maintenanceGuard.canActivate(context(user, '7'))).resolves.toBe(true);
  expect(maintenance.canManageMaintenance).toHaveBeenCalledWith(user, 7);
  await expect(maintenanceGuard.canActivate(context(user, '7'))).resolves.toBe(false);
  await expect(maintenanceGuard.canActivate(context(user, '7'))).resolves.toBe(false);
});
it('accepts direct/group introduction authority or global access management', async () => {
  introductions.isIntroducer.mockResolvedValueOnce(true).mockResolvedValue(false);
  await expect(introducerGuard.canActivate(context({ id: 3 }, '7'))).resolves.toBe(true);
  expect(introductions.isIntroducer).toHaveBeenCalledWith(7, 3, true);
  await expect(
    introducerGuard.canActivate(context({ id: 3, effectivePermissions: new Set(['resources.access.manage']) }, '7')),
  ).resolves.toBe(true);
  await expect(introducerGuard.canActivate(context({ id: 3, effectivePermissions: new Set() }, '7'))).resolves.toBe(
    false,
  );
});
