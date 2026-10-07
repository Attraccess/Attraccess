import { UserPermissionsChangedEvent } from '../../users-and-auth/rbac/events/user-permissions-changed.event';
import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheEvictsAPlainUserAuthorizationGrantWhenTheirRbacPermissionsAreRevoked(
  scope: CanControllResourceCacheTestScope,
): void {
  it('evicts a plain user authorization grant when their RBAC permissions are revoked', async () => {
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
    scope.mockRbacService.getEffectivePermissions
      .mockResolvedValueOnce(new Set(['resources.update']))
      .mockResolvedValueOnce(new Set<string>());

    await expect(scope.service.canControllResource(scope.resourceId, scope.mockUser)).resolves.toBe(true);

    scope.service.handleUserPermissionsChanged(new UserPermissionsChangedEvent(scope.mockUser.id));

    await expect(scope.service.canControllResource(scope.resourceId, scope.mockUser)).resolves.toBe(false);
    expect(scope.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(2);
  });
}
