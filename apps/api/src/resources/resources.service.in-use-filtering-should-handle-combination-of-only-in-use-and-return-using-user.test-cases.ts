import { activeUsageSql } from './usage/active-usage';
import { InUseFilteringTestScope } from './resources.service.spec';
export function registerInUseFilteringShouldHandleCombinationOfOnlyInUseAndReturnUsingUser(
  scope: InUseFilteringTestScope,
): void {
  it('should handle combination of onlyInUse and returnUsingUser', async () => {
    await scope.parentScope.service.listResources({ onlyInUse: true, returnUsingUser: true });

    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'resource.usages',
      'usage',
      activeUsageSql('usage'),
    );
    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
  });
}
