import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheCoalescesConcurrentCacheMisses(
  scope: CanControllResourceCacheTestScope,
): void {
  it('coalesces concurrent cache misses', async () => {
    let resolveIntroduction!: (value: boolean) => void;
    scope.resourceIntroductionService.hasValidIntroduction.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
    );

    const first = scope.service.canControllResource(scope.resourceId, scope.mockUser);
    const second = scope.service.canControllResource(scope.resourceId, scope.mockUser);
    await Promise.resolve();
    resolveIntroduction(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    expect(scope.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(1);
  });
}
