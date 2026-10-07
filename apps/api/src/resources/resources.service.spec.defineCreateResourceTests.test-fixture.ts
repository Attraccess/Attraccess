import { registerCreateResourceShouldCreateANewResource } from './resources.service.create-resource-should-create-a-new-resource.test-cases';
import { registerCreateResourceAuditsOnlyTheSafeResourceProjectionWhenAnActorIsAvailable } from './resources.service.create-resource-audits-only-the-safe-resource-projection-when-an-actor-is-available.test-cases';
import { registerCreateResourceBoundsAnOversizedResourceNameInTheAuditProjection } from './resources.service.create-resource-bounds-an-oversized-resource-name-in-the-audit-projection.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ResourcesServiceTestScope } from './resources.service.spec';

export function defineCreateResourceTests(parentScope: ResourcesServiceTestScope) {
  const scope = inheritTestScope(
    {
      get resourceRepository() {
        return parentScope.resourceRepository;
      },
      set resourceRepository(value: typeof parentScope.resourceRepository) {
        parentScope.resourceRepository = value;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get audit() {
        return parentScope.audit;
      },
    },
    parentScope,
  );
  registerCreateResourceShouldCreateANewResource(scope);

  registerCreateResourceAuditsOnlyTheSafeResourceProjectionWhenAnActorIsAvailable(scope);

  registerCreateResourceBoundsAnOversizedResourceNameInTheAuditProjection(scope);

  return scope;
}
