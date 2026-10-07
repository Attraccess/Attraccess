import { createMockResource } from '../test-utils/resource.fixtures';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceAuditsAnImageOnlyUpdateWithoutPersistingTheFilename(
  scope: UpdateResourceTestScope,
): void {
  it('audits an image-only update without persisting the filename', async () => {
    const resource = createMockResource({ id: 1, imageFilename: null });
    const updatedResource = createMockResource({ id: 1, imageFilename: 'resource-1.png' });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(resource);
    scope.mockResourceImageService.saveImage.mockResolvedValue('resource-1.png');
    scope.resourceRepository.save.mockResolvedValue(updatedResource);

    await scope.service.updateResource(1, {}, {} as never, { id: 9 });

    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resource.updated',
        details: { changedFields: '["image"]' },
      }),
    );
  });
}
