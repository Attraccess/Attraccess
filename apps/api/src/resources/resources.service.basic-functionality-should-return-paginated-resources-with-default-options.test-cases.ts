import { createMockResource } from '../test-utils/resource.fixtures';
import { BasicFunctionalityTestScope } from './resources.service.spec';
export function registerBasicFunctionalityShouldReturnPaginatedResourcesWithDefaultOptions(
  scope: BasicFunctionalityTestScope,
): void {
  it('should return paginated resources with default options', async () => {
    const mockResources = [
      createMockResource({
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        documentationMarkdown: '# Documentation 1',
      }),
      createMockResource({
        id: 2,
        name: 'Resource 2',
        description: 'Description 2',
        documentationMarkdown: '# Documentation 2',
      }),
    ];

    scope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 2]);

    const result = await scope.parentScope.service.listResources();

    expect(result.data).toEqual(mockResources);
    expect(result.total).toEqual(2);
    expect(result.page).toEqual(1);
    expect(result.limit).toEqual(10);
    expect(scope.parentScope.resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
    expect(scope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.groups', 'groups');
    expect(scope.mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.name', 'ASC');
    expect(scope.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    expect(scope.mockQueryBuilder.take).toHaveBeenCalledWith(10);
  });
}
