import { IdsFilteringTestScope } from './resources.service.spec';
export function registerIdsFilteringShouldFilterByMultipleResourceIds(scope: IdsFilteringTestScope): void {
  it('should filter by multiple resource IDs', async () => {
    await scope.parentScope.service.listResources({ ids: [1, 2, 3] });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2, 3] });
  });
}
