import { registerIdsFilteringShouldFilterBySingleResourceId } from './resources.service.ids-filtering-should-filter-by-single-resource-id.test-cases';
import { registerIdsFilteringShouldFilterByMultipleResourceIds } from './resources.service.ids-filtering-should-filter-by-multiple-resource-ids.test-cases';
import { registerIdsFilteringShouldNotAddIdsFilterWhenIdsArrayIsEmpty } from './resources.service.ids-filtering-should-not-add-ids-filter-when-ids-array-is-empty.test-cases';
import { registerIdsFilteringShouldNotAddIdsFilterWhenIdsIsUndefined } from './resources.service.ids-filtering-should-not-add-ids-filter-when-ids-is-undefined.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineIdsFilteringTests(parentScope: ListResourcesTestScope) {
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
  registerIdsFilteringShouldFilterBySingleResourceId(scope);

  registerIdsFilteringShouldFilterByMultipleResourceIds(scope);

  registerIdsFilteringShouldNotAddIdsFilterWhenIdsArrayIsEmpty(scope);

  registerIdsFilteringShouldNotAddIdsFilterWhenIdsIsUndefined(scope);

  return scope;
}
