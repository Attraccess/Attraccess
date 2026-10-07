import { DocumentationType, ResourceType } from '@attraccess/database-entities';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { createMockResource } from '../test-utils/resource.fixtures';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceShouldUpdateAnExistingResource(scope: UpdateResourceTestScope): void {
  it('should update an existing resource', async () => {
    const resourceId = 1;
    const updateDto: UpdateResourceDto = {
      name: 'Updated Resource',
      type: ResourceType.Machine,
      description: 'Updated Description',
      documentationType: DocumentationType.URL,
      documentationUrl: 'https://example.com/updated',
      metadata: { template: 'default', area: 'A2' },
    };

    const existingResource = createMockResource({
      id: resourceId,
      name: 'Old Resource',
      description: 'Old Description',
      documentationType: DocumentationType.MARKDOWN,
      documentationMarkdown: '# Old Documentation',
      documentationUrl: null,
      imageFilename: null,
    });

    const updatedResource = createMockResource({
      id: resourceId,
      name: updateDto.name,
      description: updateDto.description,
      documentationType: updateDto.documentationType,
      documentationMarkdown: null,
      documentationUrl: updateDto.documentationUrl,
      imageFilename: null,
      maintenances: [],
      metadata: updateDto.metadata ?? null,
    });

    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(existingResource);
    scope.resourceRepository.save.mockResolvedValue(updatedResource);

    const result = await scope.service.updateResource(resourceId, updateDto);

    expect(result).toEqual(updatedResource);
    expect(scope.service.getResourceById).toHaveBeenCalledWith(resourceId);
    expect(scope.resourceRepository.save).toHaveBeenCalled();
  });
}
