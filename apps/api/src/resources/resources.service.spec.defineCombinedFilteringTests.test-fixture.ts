import { registerCombinedFilteringShouldHandleMultipleFiltersSimultaneously } from './resources.service.combined-filtering-should-handle-multiple-filters-simultaneously.test-cases';
import { registerCombinedFilteringShouldHandleEdgeCaseWithGroupId1AndOtherFilters } from './resources.service.combined-filtering-should-handle-edge-case-with-group-id-1-and-other-filters.test-cases';
import { registerCombinedFilteringShouldHandleCombinationOfReturnUsingUserWithOtherFilters } from './resources.service.combined-filtering-should-handle-combination-of-return-using-user-with-other-filters.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineCombinedFilteringTests(parentScope: ListResourcesTestScope) {
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
  registerCombinedFilteringShouldHandleMultipleFiltersSimultaneously(scope);

  registerCombinedFilteringShouldHandleEdgeCaseWithGroupId1AndOtherFilters(scope);

  registerCombinedFilteringShouldHandleCombinationOfReturnUsingUserWithOtherFilters(scope);

  return scope;
}
