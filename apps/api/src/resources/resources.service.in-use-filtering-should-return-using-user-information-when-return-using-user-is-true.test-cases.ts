import { activeUsageSql } from './usage/active-usage';
import { InUseFilteringTestScope } from './resources.service.spec';
export function registerInUseFilteringShouldReturnUsingUserInformationWhenReturnUsingUserIsTrue(
  scope: InUseFilteringTestScope,
): void {
  it('should return using user information when returnUsingUser is true', async () => {
    await scope.parentScope.service.listResources({ returnUsingUser: true });

    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'resource.usages',
      'usage',
      activeUsageSql('usage'),
    );
    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
  });
}
