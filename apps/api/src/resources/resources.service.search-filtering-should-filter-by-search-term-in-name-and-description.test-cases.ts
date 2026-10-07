import { createMockResource } from '../test-utils/resource.fixtures';
import { SearchFilteringTestScope } from './resources.service.spec';
export function registerSearchFilteringShouldFilterBySearchTermInNameAndDescription(
  scope: SearchFilteringTestScope,
): void {
  it('should filter by search term in name and description', async () => {
    const mockResources = [
      createMockResource({
        id: 1,
        name: 'Test Resource',
        description: 'Test Description',
        documentationMarkdown: '# Documentation 1',
      }),
    ];
    scope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

    await scope.parentScope.service.listResources({ search: 'test' });

    expect(scope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
      { search: '%test%' },
    );
  });
}
