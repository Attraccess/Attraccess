import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheReQueriesDbAfterTtlExpires(
  scope: CanControllResourceCacheTestScope,
): void {
  it('re-queries DB after TTL expires', async () => {
    jest.useFakeTimers();
    try {
      await scope.service.canControllResource(scope.resourceId, scope.mockUser);
      jest.advanceTimersByTime(30_001);
      await scope.service.canControllResource(scope.resourceId, scope.mockUser);

      expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
}
