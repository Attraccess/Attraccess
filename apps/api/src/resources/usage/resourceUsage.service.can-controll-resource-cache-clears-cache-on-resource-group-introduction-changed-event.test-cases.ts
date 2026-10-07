import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheClearsCacheOnResourceGroupIntroductionChangedEvent(
  scope: CanControllResourceCacheTestScope,
): void {
  it('clears cache on ResourceGroupIntroductionChangedEvent', async () => {
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

    scope.service.handleGroupIntroductionChanged();

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
  });
}
