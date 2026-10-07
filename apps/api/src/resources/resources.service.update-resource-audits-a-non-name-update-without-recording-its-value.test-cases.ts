import { createMockResource } from '../test-utils/resource.fixtures';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceAuditsANonNameUpdateWithoutRecordingItsValue(
  scope: UpdateResourceTestScope,
): void {
  it('audits a non-name update without recording its value', async () => {
    const existingResource = createMockResource({ id: 1, allowTakeOver: false });
    const updatedResource = createMockResource({ id: 1, allowTakeOver: true });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(existingResource);
    scope.resourceRepository.save.mockResolvedValue(updatedResource);

    await scope.service.updateResource(1, { allowTakeOver: true }, undefined, { id: 9 });

    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resource.updated',
        details: { changedFields: '["allowTakeOver"]' },
      }),
    );
  });
}
