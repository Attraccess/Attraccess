import { createMockResource } from '../test-utils/resource.fixtures';
import { BasicFunctionalityTestScope } from './resources.service.spec';
export function registerBasicFunctionalityShouldHandleCustomPagination(scope: BasicFunctionalityTestScope): void {
  it('should handle custom pagination', async () => {
    const mockResources = [
      createMockResource({
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        documentationMarkdown: '# Documentation 1',
      }),
    ];
    scope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

    const result = await scope.parentScope.service.listResources({ page: 2, limit: 5 });

    expect(result.page).toEqual(2);
    expect(result.limit).toEqual(5);
    expect(scope.mockQueryBuilder.skip).toHaveBeenCalledWith(5); // (page - 1) * limit
    expect(scope.mockQueryBuilder.take).toHaveBeenCalledWith(5);
  });
}
