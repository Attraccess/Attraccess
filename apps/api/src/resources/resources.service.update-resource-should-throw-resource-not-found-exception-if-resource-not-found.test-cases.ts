import { ResourceType } from '@attraccess/database-entities';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceShouldThrowResourceNotFoundExceptionIfResourceNotFound(
  scope: UpdateResourceTestScope,
): void {
  it('should throw ResourceNotFoundException if resource not found', async () => {
    const resourceId = 999;
    const updateDto: UpdateResourceDto = {
      name: 'Updated Resource',
      type: ResourceType.Machine,
    };

    jest.spyOn(scope.service, 'getResourceById').mockRejectedValue(new ResourceNotFoundException(resourceId));

    await expect(scope.service.updateResource(resourceId, updateDto)).rejects.toThrow(ResourceNotFoundException);
  });
}
