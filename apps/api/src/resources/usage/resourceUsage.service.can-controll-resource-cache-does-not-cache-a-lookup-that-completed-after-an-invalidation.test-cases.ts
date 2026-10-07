import { User } from '@attraccess/database-entities';
import { CanControllResourceCacheTestScope } from './resourceUsage.service.spec';
export function registerCanControllResourceCacheDoesNotCacheALookupThatCompletedAfterAnInvalidation(
  scope: CanControllResourceCacheTestScope,
): void {
  it('does not cache a lookup that completed after an invalidation', async () => {
    let resolveIntroduction!: (value: boolean) => void;
    scope.resourceIntroductionService.hasValidIntroduction.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
    );

    const authorization = scope.service.canControllResource(scope.resourceId, {
      ...scope.mockUser,
      effectivePermissions: new Set<string>(),
    } as User);
    await Promise.resolve();
    scope.service.handleIntroductionChanged();
    resolveIntroduction(true);
    await authorization;

    await scope.service.canControllResource(scope.resourceId, scope.mockUser);
    expect(scope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
  });
}
