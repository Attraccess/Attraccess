import { IdsFilteringTestScope } from './resources.service.spec';
export function registerIdsFilteringShouldNotAddIdsFilterWhenIdsArrayIsEmpty(scope: IdsFilteringTestScope): void {
  it('should not add IDs filter when ids array is empty', async () => {
    await scope.parentScope.service.listResources({ ids: [] });

    expect(scope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('resource.id IN'));
  });
}
