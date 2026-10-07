import { registerPermissionFilteringShouldFilterResourcesWithPermissionsForSpecificUser } from './resources.service.permission-filtering-should-filter-resources-with-permissions-for-specific-user.test-cases';
import { registerPermissionFilteringShouldNotAddPermissionFilterWhenOnlyWithPermissionForUserIdIsUndefined } from './resources.service.permission-filtering-should-not-add-permission-filter-when-only-with-permission-for-user-id-is-undefined.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function definePermissionFilteringTests(parentScope: ListResourcesTestScope) {
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
  registerPermissionFilteringShouldFilterResourcesWithPermissionsForSpecificUser(scope);

  registerPermissionFilteringShouldNotAddPermissionFilterWhenOnlyWithPermissionForUserIdIsUndefined(scope);

  return scope;
}
