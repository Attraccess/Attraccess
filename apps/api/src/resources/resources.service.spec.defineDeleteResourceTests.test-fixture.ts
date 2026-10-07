import { registerDeleteResourceShouldDeleteAResource } from './resources.service.delete-resource-should-delete-a-resource.test-cases';
import { registerDeleteResourceAuditsDeletionWithThePreDeleteSafeProjection } from './resources.service.delete-resource-audits-deletion-with-the-pre-delete-safe-projection.test-cases';
import { registerDeleteResourceBoundsAnOversizedResourceNameInADeletionAuditProjection } from './resources.service.delete-resource-bounds-an-oversized-resource-name-in-a-deletion-audit-projection.test-cases';
import { registerDeleteResourceShouldThrowResourceNotFoundExceptionIfResourceNotFound } from './resources.service.delete-resource-should-throw-resource-not-found-exception-if-resource-not-found.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ResourcesServiceTestScope } from './resources.service.spec';

export function defineDeleteResourceTests(parentScope: ResourcesServiceTestScope) {
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
  registerDeleteResourceShouldDeleteAResource(scope);

  registerDeleteResourceAuditsDeletionWithThePreDeleteSafeProjection(scope);

  registerDeleteResourceBoundsAnOversizedResourceNameInADeletionAuditProjection(scope);

  registerDeleteResourceShouldThrowResourceNotFoundExceptionIfResourceNotFound(scope);

  return scope;
}
