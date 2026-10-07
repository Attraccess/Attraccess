import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheCachesAGrantWithAnOverdueNonBlockingRetrainingPolicy(
  scope: CanControllResourceCacheTestScope,
): void {
  it('caches a grant with an overdue non-blocking retraining policy', async () => {
    scope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
      blocksAccess: false,
      dueAt: new Date(Date.now() - 1_000),
    });

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    await scope.service.canControllResource(scope.resourceId, scope.mockUser);

    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
  });
}
