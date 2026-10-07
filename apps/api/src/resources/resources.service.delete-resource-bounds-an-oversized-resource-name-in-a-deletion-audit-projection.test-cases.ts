import { ResourceType } from '@attraccess/database-entities';
import { createMockResource } from '../test-utils/resource.fixtures';
import { projectResourceAuditEvent } from '../audit/audit-policy';
import { randomUUID } from 'node:crypto';
import { DeleteResourceTestScope } from './resources.service.spec';
export function registerDeleteResourceBoundsAnOversizedResourceNameInADeletionAuditProjection(
  scope: DeleteResourceTestScope,
): void {
  it('bounds an oversized resource name in a deletion audit projection', async () => {
    const resource = createMockResource({
      id: 1,
      name: '\0'.repeat(5000) + '🙂'.repeat(5000),
      type: ResourceType.Machine,
    });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(resource);
    scope.resourceRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

    await scope.service.deleteResource(1, { id: 9 });

    const details = scope.audit.recordResource.mock.calls[0][0].details;
    expect(details['before.name']).toMatch(/\.\.\.$/);
    expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
    expect(
      projectResourceAuditEvent({
        ...scope.audit.recordResource.mock.calls[0][0],
        operationId: randomUUID(),
      }),
    ).not.toBeNull();
  });
}
