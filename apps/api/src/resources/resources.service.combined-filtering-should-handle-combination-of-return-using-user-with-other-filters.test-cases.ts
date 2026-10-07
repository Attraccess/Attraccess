import { activeUsageSql } from './usage/active-usage';
import { CombinedFilteringTestScope } from './resources.service.spec';
export function registerCombinedFilteringShouldHandleCombinationOfReturnUsingUserWithOtherFilters(
  scope: CombinedFilteringTestScope,
): void {
  it('should handle combination of returnUsingUser with other filters', async () => {
    await scope.parentScope.service.listResources({
      returnUsingUser: true,
      onlyWithPermissionForUserId: 15,
      search: 'test',
    });

    // Should use leftJoinAndSelect for usages when returnUsingUser is true
    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'resource.usages',
      'usage',
      activeUsageSql('usage'),
    );
    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');

    // Should still add permission filtering joins
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');

    // Should add search filter
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
      { search: '%test%' },
    );
  });
}
