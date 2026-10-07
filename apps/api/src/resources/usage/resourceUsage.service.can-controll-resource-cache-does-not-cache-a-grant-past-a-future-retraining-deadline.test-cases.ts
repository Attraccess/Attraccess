import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheDoesNotCacheAGrantPastAFutureRetrainingDeadline(
  scope: CanControllResourceCacheTestScope,
): void {
  it('does not cache a grant past a future retraining deadline', async () => {
    jest.useFakeTimers();
    try {
      scope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: new Date(Date.now() + 1_000),
      });

      await scope.service.canControllResource(scope.resourceId, scope.mockUser);
      jest.advanceTimersByTime(1_001);
      await scope.service.canControllResource(scope.resourceId, scope.mockUser);

      expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
}
