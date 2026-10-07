import { User } from '@attraccess/database-entities';
import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheClearsOnlyTheSpecificEntryOnResourceIntroducerChangedEvent(
  scope: CanControllResourceCacheTestScope,
): void {
  it('clears only the specific entry on ResourceIntroducerChangedEvent', async () => {
    const otherUser: User = { id: 2, systemPermissions: { canManageResources: false } } as User;
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    await scope.service.canControllResource(scope.resourceId, otherUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);

    scope.service.handleIntroducerChanged({
      introducerUserId: scope.mockUser.id,
      resourceId: scope.resourceId,
    } as import('../introducers/events/resource-introducer-changed.event').ResourceIntroducerChangedEvent);

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    // mockUser's entry was cleared; otherUser's entry should still be cached.
    await scope.service.canControllResource(scope.resourceId, otherUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(3);
  });
}
