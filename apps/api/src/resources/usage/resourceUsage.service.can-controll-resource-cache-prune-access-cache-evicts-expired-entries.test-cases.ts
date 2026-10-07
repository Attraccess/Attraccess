import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCachePruneAccessCacheEvictsExpiredEntries(
  scope: CanControllResourceCacheTestScope,
): void {
  it('pruneAccessCache evicts expired entries', async () => {
    jest.useFakeTimers();
    try {
      await scope.service.canControllResource(scope.resourceId, scope.mockUser);
      jest.advanceTimersByTime(30_001);
      // @ts-expect-error access private method for testing
      scope.service.pruneAccessCache();
      // @ts-expect-error access private field for testing
      expect(scope.service.accessCache.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
}
