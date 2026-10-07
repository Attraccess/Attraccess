import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheCachesTheRbacLookupForUsersWithoutRequestScopedPermissions(
  scope: CanControllResourceCacheTestScope,
): void {
  it('caches the RBAC lookup for users without request-scoped permissions', async () => {
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);

    expect(scope.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(1);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
  });
}
