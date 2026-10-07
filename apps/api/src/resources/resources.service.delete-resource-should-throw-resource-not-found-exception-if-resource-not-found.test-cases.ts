import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { DeleteResourceTestScope } from './resources.service.spec';
export function registerDeleteResourceShouldThrowResourceNotFoundExceptionIfResourceNotFound(
  scope: DeleteResourceTestScope,
): void {
  it('should throw ResourceNotFoundException if resource not found', async () => {
    (scope.resourceRepository.softDelete as jest.Mock).mockResolvedValue({ affected: 0, raw: {}, generatedMaps: [] });

    await expect(scope.service.deleteResource(999)).rejects.toThrow(ResourceNotFoundException);
  });
}
