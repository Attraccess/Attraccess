import { registerInUseFilteringShouldFilterResourcesCurrentlyInUseBySpecificUser } from './resources.service.in-use-filtering-should-filter-resources-currently-in-use-by-specific-user.test-cases';
import { registerInUseFilteringShouldNotAddInUseFilterWhenOnlyInUseByUserIdIsUndefined } from './resources.service.in-use-filtering-should-not-add-in-use-filter-when-only-in-use-by-user-id-is-undefined.test-cases';
import { registerInUseFilteringShouldFilterResourcesCurrentlyInUseOnlyInUse } from './resources.service.in-use-filtering-should-filter-resources-currently-in-use-only-in-use.test-cases';
import { registerInUseFilteringShouldReturnUsingUserInformationWhenReturnUsingUserIsTrue } from './resources.service.in-use-filtering-should-return-using-user-information-when-return-using-user-is-true.test-cases';
import { registerInUseFilteringShouldHandleCombinationOfOnlyInUseAndReturnUsingUser } from './resources.service.in-use-filtering-should-handle-combination-of-only-in-use-and-return-using-user.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineInUseFilteringTests(parentScope: ListResourcesTestScope) {
  const scope = inheritTestScope(
    {
      get parentScope() {
        return parentScope;
      },
      get mockQueryBuilder() {
        return parentScope.mockQueryBuilder;
      },
      set mockQueryBuilder(value: typeof parentScope.mockQueryBuilder) {
        parentScope.mockQueryBuilder = value;
      },
    },
    parentScope,
  );
  registerInUseFilteringShouldFilterResourcesCurrentlyInUseBySpecificUser(scope);

  registerInUseFilteringShouldNotAddInUseFilterWhenOnlyInUseByUserIdIsUndefined(scope);

  registerInUseFilteringShouldFilterResourcesCurrentlyInUseOnlyInUse(scope);

  registerInUseFilteringShouldReturnUsingUserInformationWhenReturnUsingUserIsTrue(scope);

  registerInUseFilteringShouldHandleCombinationOfOnlyInUseAndReturnUsingUser(scope);

  return scope;
}
