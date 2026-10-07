import { registerQueryBuilderMethodCallsOrderAndStructureShouldMaintainProperQueryBuilderMethodCallOrder } from './resources.service.query-builder-method-calls-order-and-structure-should-maintain-proper-query-builder-method-call-order.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineQueryBuilderMethodCallsOrderAndStructureTests(parentScope: ListResourcesTestScope) {
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
  registerQueryBuilderMethodCallsOrderAndStructureShouldMaintainProperQueryBuilderMethodCallOrder(scope);

  return scope;
}
