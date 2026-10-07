import { activeUsageSql } from './usage/active-usage';
import { Brackets } from 'typeorm';
import { InUseFilteringTestScope } from './resources.service.spec';
export function registerInUseFilteringShouldFilterResourcesCurrentlyInUseBySpecificUser(
  scope: InUseFilteringTestScope,
): void {
  it('should filter resources currently in use by specific user', async () => {
    await scope.parentScope.service.listResources({ onlyInUseByUserId: 10 });

    expect(scope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.usages', 'usage', activeUsageSql('usage'));
    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
  });
}
