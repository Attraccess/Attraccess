import { SearchFilteringTestScope } from './resources.service.spec';
export function registerSearchFilteringShouldNotAddSearchFilterWhenSearchIsEmpty(
  scope: SearchFilteringTestScope,
): void {
  it('should not add search filter when search is empty', async () => {
    await scope.parentScope.service.listResources({ search: '' });

    expect(scope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('LOWER(resource.name) LIKE LOWER(:search)'),
    );
  });
}
