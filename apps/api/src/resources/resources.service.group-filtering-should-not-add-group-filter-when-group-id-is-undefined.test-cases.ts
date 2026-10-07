import { GroupFilteringTestScope } from './resources.service.spec';
export function registerGroupFilteringShouldNotAddGroupFilterWhenGroupIdIsUndefined(
  scope: GroupFilteringTestScope,
): void {
  it('should not add group filter when groupId is undefined', async () => {
    await scope.parentScope.service.listResources();

    expect(scope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('groups.id'));
  });
}
