import { createMockResource } from '../test-utils/resource.fixtures';
import { GetResourceByIdTestScope } from './resources.service.spec';
export function registerGetResourceByIdShouldReturnAResourceById(scope: GetResourceByIdTestScope): void {
  it('should return a resource by id', async () => {
    const mockResource = createMockResource({
      id: 1,
      name: 'Resource 1',
      description: 'Description 1',
      documentationMarkdown: '# Documentation 1',
    });

    scope.resourceRepository.find.mockResolvedValue([mockResource]);

    const result = await scope.service.getResourceById(1);

    expect(result).toEqual(mockResource);
    expect(scope.resourceRepository.find).toHaveBeenCalledWith({
      where: { id: expect.anything() },
      relations: ['introductions', 'usages', 'groups'],
    });
  });
}
