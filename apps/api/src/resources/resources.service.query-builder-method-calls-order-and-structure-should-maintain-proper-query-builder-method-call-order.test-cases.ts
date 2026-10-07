import { QueryBuilderMethodCallsOrderAndStructureTestScope } from './resources.service.spec';
export function registerQueryBuilderMethodCallsOrderAndStructureShouldMaintainProperQueryBuilderMethodCallOrder(
  scope: QueryBuilderMethodCallsOrderAndStructureTestScope,
): void {
  it('should maintain proper query builder method call order', async () => {
    await scope.parentScope.service.listResources({
      search: 'test',
      groupId: 1,
      onlyWithPermissionForUserId: 5,
    });

    // Verify that basic joins happen before filters
    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.groups', 'groups');
    expect(scope.mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.name', 'ASC');
    expect(scope.mockQueryBuilder.getManyAndCount).toHaveBeenCalled();

    // Verify that permission-related joins are called
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introductions', 'introduction');

    // Verify that filters are applied
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 1 });
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
      { search: '%test%' },
    );
  });
}
