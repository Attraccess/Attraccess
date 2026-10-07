import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheReturnsCachedResultOnRepeatedCallWithoutHittingDbAgain(
  scope: CanControllResourceCacheTestScope,
): void {
  it('returns cached result on repeated call without hitting DB again', async () => {
    const first = await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    const second = await scope.service.canControllResource(scope.resourceId, scope.mockUser);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
  });
}
