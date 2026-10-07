import { ResourceType } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { createMockResource } from '../test-utils/resource.fixtures';
import { ResourcesServiceTestScope } from './resources.service.spec';
export function registerResourcesServiceRemovesTheNewResourceIfPersistingItsImageFilenameFails(
  scope: ResourcesServiceTestScope,
): void {
  it('removes the new resource if persisting its image filename fails', async () => {
    const resource = createMockResource({ id: 8 });
    scope.resourceRepository.count.mockResolvedValue(2);
    scope.resourceRepository.create.mockReturnValue(resource);
    scope.resourceRepository.save
      .mockResolvedValueOnce(resource)
      .mockRejectedValueOnce(new Error('image metadata write failed'));
    scope.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    await expect(
      scope.service.createResource(
        { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
        { buffer: Buffer.from('image') } as never,
      ),
    ).rejects.toThrow('image metadata write failed');
    expect(scope.resourceRepository.delete).toHaveBeenCalledWith(8);
    expect(scope.audit.recordResource).not.toHaveBeenCalled();
  });
}
