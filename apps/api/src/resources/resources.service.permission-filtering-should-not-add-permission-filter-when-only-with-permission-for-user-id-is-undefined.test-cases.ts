import { PermissionFilteringTestScope } from './resources.service.spec';
export function registerPermissionFilteringShouldNotAddPermissionFilterWhenOnlyWithPermissionForUserIdIsUndefined(
  scope: PermissionFilteringTestScope,
): void {
  it('should not add permission filter when onlyWithPermissionForUserId is undefined', async () => {
    await scope.parentScope.service.listResources();

    expect(scope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.introducers', 'introducer');
    expect(scope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.introductions', 'introduction');
  });
}
