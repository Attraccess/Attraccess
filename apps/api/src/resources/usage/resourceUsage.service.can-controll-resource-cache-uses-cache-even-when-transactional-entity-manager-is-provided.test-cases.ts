import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheUsesCacheEvenWhenTransactionalEntityManagerIsProvided(
  scope: CanControllResourceCacheTestScope,
): void {
  it('uses cache even when transactionalEntityManager is provided', async () => {
    const fakeTem = {} as import('typeorm').EntityManager;

    // First call (no TEM) populates the cache.
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

    // Second call WITH a TEM should still hit the cache — no extra DB queries.
    await scope.service.canControllResource(scope.resourceId, scope.mockUser, fakeTem);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
  });
}
