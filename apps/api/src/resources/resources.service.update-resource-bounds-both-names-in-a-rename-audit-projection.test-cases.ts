import { createMockResource } from '../test-utils/resource.fixtures';
import { projectResourceAuditEvent } from '../audit/audit-policy';
import { randomUUID } from 'node:crypto';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceBoundsBothNamesInARenameAuditProjection(scope: UpdateResourceTestScope): void {
  it('bounds both names in a rename audit projection', async () => {
    const existingResource = createMockResource({ id: 1, name: '"'.repeat(5000) });
    const updatedResource = createMockResource({ id: 1, name: '\\'.repeat(5000) + '🚪'.repeat(5000) });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(existingResource);
    scope.resourceRepository.save.mockResolvedValue(updatedResource);

    await scope.service.updateResource(1, { name: updatedResource.name }, undefined, { id: 9 });

    const details = scope.audit.recordResource.mock.calls[0][0].details;
    expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
    expect(
      projectResourceAuditEvent({
        ...scope.audit.recordResource.mock.calls[0][0],
        operationId: randomUUID(),
      }),
    ).not.toBeNull();
  });
}
