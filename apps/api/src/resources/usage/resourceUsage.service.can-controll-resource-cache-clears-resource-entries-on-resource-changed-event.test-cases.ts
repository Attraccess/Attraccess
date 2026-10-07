import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheClearsResourceEntriesOnResourceChangedEvent(
  scope: CanControllResourceCacheTestScope,
): void {
  it('clears resource entries on ResourceChangedEvent', async () => {
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

    scope.service.handleResourceChanged({
      resourceId: scope.resourceId,
    } as import('../events/resource-changed.event').ResourceChangedEvent);

    // @ts-expect-error access private field for testing
    expect(scope.service.accessCacheKeysByUser.has(scope.mockUser.id)).toBe(false);

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
  });
}
