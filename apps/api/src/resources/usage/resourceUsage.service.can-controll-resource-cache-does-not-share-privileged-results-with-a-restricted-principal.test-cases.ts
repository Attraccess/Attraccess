import { User } from '@attraccess/database-entities';
import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheDoesNotSharePrivilegedResultsWithARestrictedPrincipal(
  scope: CanControllResourceCacheTestScope,
): void {
  it('does not share privileged results with a restricted principal', async () => {
    const privilegedUser = {
      ...scope.mockUser,
      effectivePermissions: new Set(['resources.update']),
    } as User;
    const restrictedUser = {
      ...scope.mockUser,
      effectivePermissions: new Set<string>(),
    } as User;
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.canMaintain.mockResolvedValue(false);

    await expect(scope.service.canControllResource(scope.resourceId, privilegedUser)).resolves.toBe(true);
    await expect(scope.service.canControllResource(scope.resourceId, restrictedUser)).resolves.toBe(false);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
  });
}
