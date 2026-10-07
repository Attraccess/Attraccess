import { GroupFilteringTestScope } from './resources.service.spec';
export function registerGroupFilteringShouldFilterResourcesWithNoGroupsWhenGroupIdIs1(
  scope: GroupFilteringTestScope,
): void {
  it('should filter resources with no groups when groupId is -1', async () => {
    await scope.parentScope.service.listResources({ groupId: -1 });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
  });
}
