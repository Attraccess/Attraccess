import { IdsFilteringTestScope } from './resources.service.spec';
export function registerIdsFilteringShouldNotAddIdsFilterWhenIdsIsUndefined(scope: IdsFilteringTestScope): void {
  it('should not add IDs filter when ids is undefined', async () => {
    await scope.parentScope.service.listResources();

    expect(scope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('resource.id IN'));
  });
}
