import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheClearsCacheOnResourceIntroductionChangedEvent(
  scope: CanControllResourceCacheTestScope,
): void {
  it('clears cache on ResourceIntroductionChangedEvent', async () => {
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

    scope.service.handleIntroductionChanged();

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
  });
}
