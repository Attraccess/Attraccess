import { ResourceType } from '@attraccess/database-entities';
import { createMockResource } from '../test-utils/resource.fixtures';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceAuditsChangedSafeFieldsWithoutMetadataOrDocumentation(
  scope: UpdateResourceTestScope,
): void {
  it('audits changed safe fields without metadata or documentation', async () => {
    const existingResource = createMockResource({ id: 1, name: 'Old', type: ResourceType.Lock });
    const updatedResource = createMockResource({ id: 1, name: 'New', type: ResourceType.Machine });
    updatedResource.metadata = { password: 'secret' };
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(existingResource);
    scope.resourceRepository.save.mockResolvedValue(updatedResource);

    await scope.service.updateResource(
      1,
      { name: 'New', type: ResourceType.Machine, metadata: { password: 'secret' } },
      undefined,
      { id: 9 },
    );

    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resource.updated',
        details: {
          'before.name': 'Old',
          'after.name': 'New',
          'before.type': ResourceType.Lock,
          'after.type': ResourceType.Machine,
          changedFields: '["name","type","metadata"]',
        },
      }),
    );
  });
}
