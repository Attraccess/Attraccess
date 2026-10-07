import { CombinedFilteringTestScope } from './resources.service.spec';
export function registerCombinedFilteringShouldHandleEdgeCaseWithGroupId1AndOtherFilters(
  scope: CombinedFilteringTestScope,
): void {
  it('should handle edge case with groupId -1 and other filters', async () => {
    await scope.parentScope.service.listResources({
      groupId: -1,
      search: 'test',
      ids: [1, 2],
    });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
      { search: '%test%' },
    );
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2] });
  });
}
