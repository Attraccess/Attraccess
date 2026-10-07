import { ResourceType } from '@attraccess/database-entities';
import { createMockResource } from '../test-utils/resource.fixtures';
import { DeleteResourceTestScope } from './resources.service.spec';
export function registerDeleteResourceAuditsDeletionWithThePreDeleteSafeProjection(
  scope: DeleteResourceTestScope,
): void {
  it('audits deletion with the pre-delete safe projection', async () => {
    const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(resource);
    scope.resourceRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

    await scope.service.deleteResource(1, { id: 9 });

    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resource.deleted',
        actorId: 9,
        details: { 'before.name': 'Lathe', 'before.type': ResourceType.Machine },
      }),
    );
  });
}
