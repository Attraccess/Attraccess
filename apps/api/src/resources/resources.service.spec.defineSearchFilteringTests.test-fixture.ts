import { registerSearchFilteringShouldFilterBySearchTermInNameAndDescription } from './resources.service.search-filtering-should-filter-by-search-term-in-name-and-description.test-cases';
import { registerSearchFilteringShouldNotAddSearchFilterWhenSearchIsEmpty } from './resources.service.search-filtering-should-not-add-search-filter-when-search-is-empty.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineSearchFilteringTests(parentScope: ListResourcesTestScope) {
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
  registerSearchFilteringShouldFilterBySearchTermInNameAndDescription(scope);

  registerSearchFilteringShouldNotAddSearchFilterWhenSearchIsEmpty(scope);

  return scope;
}
