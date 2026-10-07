import { registerGroupFilteringShouldFilterBySpecificGroupId } from './resources.service.group-filtering-should-filter-by-specific-group-id.test-cases';
import { registerGroupFilteringShouldFilterResourcesWithNoGroupsWhenGroupIdIs1 } from './resources.service.group-filtering-should-filter-resources-with-no-groups-when-group-id-is-1.test-cases';
import { registerGroupFilteringShouldNotAddGroupFilterWhenGroupIdIsUndefined } from './resources.service.group-filtering-should-not-add-group-filter-when-group-id-is-undefined.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineGroupFilteringTests(parentScope: ListResourcesTestScope) {
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
  registerGroupFilteringShouldFilterBySpecificGroupId(scope);

  registerGroupFilteringShouldFilterResourcesWithNoGroupsWhenGroupIdIs1(scope);

  registerGroupFilteringShouldNotAddGroupFilterWhenGroupIdIsUndefined(scope);

  return scope;
}
