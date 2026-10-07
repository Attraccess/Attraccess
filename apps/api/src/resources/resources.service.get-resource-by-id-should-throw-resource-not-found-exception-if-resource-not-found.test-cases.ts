import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { GetResourceByIdTestScope } from './resources.service.spec';
export function registerGetResourceByIdShouldThrowResourceNotFoundExceptionIfResourceNotFound(
  scope: GetResourceByIdTestScope,
): void {
  it('should throw ResourceNotFoundException if resource not found', async () => {
    scope.resourceRepository.find.mockResolvedValue([]);

    await expect(scope.service.getResourceById(999)).rejects.toThrow(ResourceNotFoundException);
  });
}
