import { IdsFilteringTestScope } from './resources.service.spec';
export function registerIdsFilteringShouldFilterBySingleResourceId(scope: IdsFilteringTestScope): void {
  it('should filter by single resource ID', async () => {
    await scope.parentScope.service.listResources({ ids: 5 });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [5] });
  });
}
