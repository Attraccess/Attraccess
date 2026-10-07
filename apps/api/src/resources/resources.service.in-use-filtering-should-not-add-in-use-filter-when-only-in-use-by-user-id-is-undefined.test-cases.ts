import { activeUsageSql } from './usage/active-usage';
import { InUseFilteringTestScope } from './resources.service.spec';
export function registerInUseFilteringShouldNotAddInUseFilterWhenOnlyInUseByUserIdIsUndefined(
  scope: InUseFilteringTestScope,
): void {
  it('should not add in-use filter when onlyInUseByUserId is undefined', async () => {
    await scope.parentScope.service.listResources();

    expect(scope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
      'resource.usages',
      'usage',
      activeUsageSql('usage'),
    );
  });
}
