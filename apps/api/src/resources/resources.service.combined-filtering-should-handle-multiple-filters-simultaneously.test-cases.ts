import { activeUsageSql } from './usage/active-usage';
import { createMockResource } from '../test-utils/resource.fixtures';
import { CombinedFilteringTestScope } from './resources.service.spec';
export function registerCombinedFilteringShouldHandleMultipleFiltersSimultaneously(
  scope: CombinedFilteringTestScope,
): void {
  it('should handle multiple filters simultaneously', async () => {
    const mockResources = [
      createMockResource({
        id: 1,
        name: 'Test Resource',
        description: 'Test Description',
        documentationMarkdown: '# Documentation 1',
      }),
    ];
    scope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

    const result = await scope.parentScope.service.listResources({
      page: 2,
      limit: 5,
      search: 'test',
      groupId: 3,
      ids: [1, 2, 3],
      onlyInUseByUserId: 10,
      onlyWithPermissionForUserId: 15,
    });

    // Verify pagination
    expect(scope.mockQueryBuilder.skip).toHaveBeenCalledWith(5);
    expect(scope.mockQueryBuilder.take).toHaveBeenCalledWith(5);

    // Verify search filter
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
      { search: '%test%' },
    );

    // Verify group filter
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 3 });

    // Verify IDs filter
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2, 3] });

    // Verify all joins for both in-use and permission filtering
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.usages', 'usage', activeUsageSql('usage'));
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');

    // Verify result structure
    expect(result.data).toEqual(mockResources);
    expect(result.total).toEqual(1);
    expect(result.page).toEqual(2);
    expect(result.limit).toEqual(5);
  });
}
