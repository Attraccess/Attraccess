import { activeUsageSql } from './usage/active-usage';
import { InUseFilteringTestScope } from './resources.service.spec';
export function registerInUseFilteringShouldFilterResourcesCurrentlyInUseOnlyInUse(
  scope: InUseFilteringTestScope,
): void {
  it('should filter resources currently in use (onlyInUse)', async () => {
    await scope.parentScope.service.listResources({ onlyInUse: true });

    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.usages', 'usage', activeUsageSql('usage'));
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
  });
}
