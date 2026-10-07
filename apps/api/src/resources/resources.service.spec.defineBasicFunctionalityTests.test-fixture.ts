import { registerBasicFunctionalityShouldReturnPaginatedResourcesWithDefaultOptions } from './resources.service.basic-functionality-should-return-paginated-resources-with-default-options.test-cases';
import { registerBasicFunctionalityShouldHandleCustomPagination } from './resources.service.basic-functionality-should-handle-custom-pagination.test-cases';
import { registerBasicFunctionalityShouldReturnEmptyResults } from './resources.service.basic-functionality-should-return-empty-results.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineBasicFunctionalityTests(parentScope: ListResourcesTestScope) {
  const scope = inheritTestScope(
    {
      get mockQueryBuilder() {
        return parentScope.mockQueryBuilder;
      },
      set mockQueryBuilder(value: typeof parentScope.mockQueryBuilder) {
        parentScope.mockQueryBuilder = value;
      },
      get parentScope() {
        return parentScope;
      },
    },
    parentScope,
  );
  registerBasicFunctionalityShouldReturnPaginatedResourcesWithDefaultOptions(scope);

  registerBasicFunctionalityShouldHandleCustomPagination(scope);

  registerBasicFunctionalityShouldReturnEmptyResults(scope);

  return scope;
}
