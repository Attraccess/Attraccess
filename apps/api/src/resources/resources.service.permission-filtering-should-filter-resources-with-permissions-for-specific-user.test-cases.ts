import { Brackets } from 'typeorm';
import { PermissionFilteringTestScope } from './resources.service.spec';
export function registerPermissionFilteringShouldFilterResourcesWithPermissionsForSpecificUser(
  scope: PermissionFilteringTestScope,
): void {
  it('should filter resources with permissions for specific user', async () => {
    await scope.parentScope.service.listResources({ onlyWithPermissionForUserId: 15 });

    // Check all the necessary joins for permission checking
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introductions', 'introduction');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('introduction.history', 'resourceIntroductionHistory');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.groups', 'resourceGroup');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resourceGroup.introducers', 'groupIntroducer');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resourceGroup.introductions', 'groupIntroduction');
    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
      'groupIntroduction.history',
      'groupIntroductionHistory',
    );

    // Check that the complex where condition is added
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
  });
}
