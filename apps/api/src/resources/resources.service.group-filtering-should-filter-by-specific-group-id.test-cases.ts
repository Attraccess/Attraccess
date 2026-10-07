import { GroupFilteringTestScope } from './resources.service.spec';
export function registerGroupFilteringShouldFilterBySpecificGroupId(scope: GroupFilteringTestScope): void {
  it('should filter by specific group ID', async () => {
    await scope.parentScope.service.listResources({ groupId: 5 });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 5 });
  });
}
