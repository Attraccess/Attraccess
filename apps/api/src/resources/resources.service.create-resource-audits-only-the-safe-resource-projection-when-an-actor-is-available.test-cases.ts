import { ResourceType } from '@attraccess/database-entities';
import { createMockResource } from '../test-utils/resource.fixtures';
import { CreateResourceTestScope } from './resources.service.spec';
export function registerCreateResourceAuditsOnlyTheSafeResourceProjectionWhenAnActorIsAvailable(
  scope: CreateResourceTestScope,
): void {
  it('audits only the safe resource projection when an actor is available', async () => {
    const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
    scope.resourceRepository.create.mockReturnValue(resource);
    scope.resourceRepository.save.mockResolvedValue(resource);

    await scope.service.createResource({ name: 'Lathe', type: ResourceType.Machine }, undefined, { id: 9 });

    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'resource.created',
        actorId: 9,
        subjectId: 1,
        details: { 'after.name': 'Lathe', 'after.type': ResourceType.Machine },
      }),
    );
  });
}
