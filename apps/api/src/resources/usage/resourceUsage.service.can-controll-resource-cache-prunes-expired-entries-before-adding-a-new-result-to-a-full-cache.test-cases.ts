import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCachePrunesExpiredEntriesBeforeAddingANewResultToAFullCache(
  scope: CanControllResourceCacheTestScope,
): void {
  it('prunes expired entries before adding a new result to a full cache', async () => {
    // @ts-expect-error access private field for testing
    const MAX = scope.service.ACCESS_CACHE_MAX_SIZE as number;
    // @ts-expect-error access private field for testing
    const cache = scope.service.accessCache as Map<string, unknown>;

    // Fill the cache with expired entries so the next result can claim a slot.
    for (let i = 0; i < MAX; i++) {
      cache.set(`stub:${i}`, { userId: i, resourceId: i, result: true, expiresAt: Date.now() - 1 });
    }

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);

    expect(cache.size).toBe(1);
    expect(cache.has(`${scope.mockUser.id}:${scope.resourceId}:default`)).toBe(true);
  });
}
