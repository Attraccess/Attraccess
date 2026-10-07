import { ResourceType } from '@attraccess/database-entities';
import { CreateResourceDto } from './dtos/createResource.dto';
import { createMockResource } from '../test-utils/resource.fixtures';
import { ResourcesServiceTestScope } from './resources.service.spec';
export function registerResourcesServiceCreatesAResourceWithUploadedImageAndRecordsActorAttributionAfterPersistence(
  scope: ResourcesServiceTestScope,
): void {
  it('creates a resource with uploaded image and records actor attribution after persistence', async () => {
    const resource = createMockResource({ id: 8, name: 'Lathe', type: ResourceType.Machine });
    scope.resourceRepository.count.mockResolvedValue(2);
    scope.resourceRepository.create.mockReturnValue(resource);
    scope.resourceRepository.save.mockResolvedValue(resource);
    scope.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    const file = { buffer: Buffer.from('image') };
    const result = await scope.service.createResource(
      { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
      file as never,
      { id: 7, authenticationMethod: 'api-token', apiTokenId: 9 },
    );
    expect(result.imageFilename).toBe('image.webp');
    expect(scope.mockResourceImageService.saveImage).toHaveBeenCalledWith(8, file);
    expect(scope.resourceRepository.save).toHaveBeenCalledTimes(2);
    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resource.created', actorId: 7, apiTokenId: 9, subjectId: 8 }),
    );
  });
}
