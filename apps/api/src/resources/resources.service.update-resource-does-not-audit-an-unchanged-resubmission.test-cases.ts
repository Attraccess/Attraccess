import { createMockResource } from '../test-utils/resource.fixtures';
import { UpdateResourceTestScope } from './resources.service.spec';
export function registerUpdateResourceDoesNotAuditAnUnchangedResubmission(scope: UpdateResourceTestScope): void {
  it('does not audit an unchanged resubmission', async () => {
    const resource = createMockResource({ id: 1, allowTakeOver: false });
    jest.spyOn(scope.service, 'getResourceById').mockResolvedValue(resource);
    scope.resourceRepository.save.mockResolvedValue(resource);

    await scope.service.updateResource(1, { allowTakeOver: false }, undefined, { id: 9 });

    expect(scope.audit.recordResource).not.toHaveBeenCalled();
  });
}
