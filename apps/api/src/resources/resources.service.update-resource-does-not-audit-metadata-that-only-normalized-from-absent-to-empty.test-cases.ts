import { createMockResource } from '../test-utils/resource.fixtures';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceDoesNotAuditMetadataThatOnlyNormalizedFromAbsentToEmpty(
  scope: UpdateResourceTestScope,
): void {
  it('does not audit metadata that only normalized from absent to empty', async () => {
    const existingResource = createMockResource({ id: 1, name: 'Old', metadata: null });
    const updatedResource = createMockResource({ id: 1, name: 'New', metadata: {} });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(existingResource);
    scope.resourceRepository.save.mockResolvedValue(updatedResource);

    await scope.service.updateResource(1, { name: 'New', metadata: {} }, undefined, { id: 9 });

    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resource.updated',
        details: { 'before.name': 'Old', 'after.name': 'New', changedFields: '["name"]' },
      }),
    );
  });
}
