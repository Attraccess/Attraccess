import { ResourceType } from '@attraccess/database-entities';
import { createMockResource } from '../test-utils/resource.fixtures';
import { projectResourceAuditEvent } from '../audit/audit-policy';
import { randomUUID } from 'node:crypto';
import { CreateResourceTestScope } from './resources.service.spec';
export function registerCreateResourceBoundsAnOversizedResourceNameInTheAuditProjection(
  scope: CreateResourceTestScope,
): void {
  it('bounds an oversized resource name in the audit projection', async () => {
    const resource = createMockResource({ id: 1, name: '"\\\0🙂'.repeat(5000), type: ResourceType.Machine });
    scope.resourceRepository.create.mockReturnValue(resource);
    scope.resourceRepository.save.mockResolvedValue(resource);

    await scope.service.createResource({ name: resource.name, type: ResourceType.Machine }, undefined, { id: 9 });

    const details = scope.audit.recordResource.mock.calls[0][0].details;
    expect(details['after.name']).toMatch(/\.\.\.$/);
    expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
    expect(
      projectResourceAuditEvent({
        ...scope.audit.recordResource.mock.calls[0][0],
        operationId: randomUUID(),
      }),
    ).not.toBeNull();
  });
}
