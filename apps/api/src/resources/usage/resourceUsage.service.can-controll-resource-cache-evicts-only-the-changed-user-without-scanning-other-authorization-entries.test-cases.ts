import { User } from '@attraccess/database-entities';
import { UserPermissionsChangedEvent } from '../../users-and-auth/rbac/events/user-permissions-changed.event';
import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheEvictsOnlyTheChangedUserWithoutScanningOtherAuthorizationEntries(
  scope: CanControllResourceCacheTestScope,
): void {
  it('evicts only the changed user without scanning other authorization entries', async () => {
    const otherUser: User = { id: 2, systemPermissions: { canManageResources: false } } as User;
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    await scope.service.canControllResource(scope.resourceId, otherUser);

    scope.service.handleUserPermissionsChanged(new UserPermissionsChangedEvent(scope.mockUser.id));

    // @ts-expect-error access private field for testing
    expect(scope.service.accessCacheKeysByUser.has(scope.mockUser.id)).toBe(false);
    // @ts-expect-error access private field for testing
    expect(scope.service.accessCacheKeysByUser.has(otherUser.id)).toBe(true);
  });
}
