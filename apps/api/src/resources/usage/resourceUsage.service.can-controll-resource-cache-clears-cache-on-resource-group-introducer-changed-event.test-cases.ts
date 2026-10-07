import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheClearsCacheOnResourceGroupIntroducerChangedEvent(
  scope: CanControllResourceCacheTestScope,
): void {
  it('clears cache on ResourceGroupIntroducerChangedEvent', async () => {
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

    scope.service.handleGroupIntroducerChanged();

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
  });
}
