import { registerGetResourceByIdShouldReturnAResourceById } from './resources.service.get-resource-by-id-should-return-a-resource-by-id.test-cases';
import { registerGetResourceByIdShouldThrowResourceNotFoundExceptionIfResourceNotFound } from './resources.service.get-resource-by-id-should-throw-resource-not-found-exception-if-resource-not-found.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ResourcesServiceTestScope } from './resources.service.spec';

export function defineGetResourceByIdTests(parentScope: ResourcesServiceTestScope) {
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
    },
    parentScope,
  );
  registerGetResourceByIdShouldReturnAResourceById(scope);

  registerGetResourceByIdShouldThrowResourceNotFoundExceptionIfResourceNotFound(scope);

  return scope;
}
