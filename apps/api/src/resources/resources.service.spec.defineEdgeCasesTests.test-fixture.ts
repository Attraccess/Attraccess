import { registerEdgeCasesShouldHandleNullUndefinedOptionsGracefully } from './resources.service.edge-cases-should-handle-null-undefined-options-gracefully.test-cases';
import { registerEdgeCasesShouldHandleEmptyOptionsObject } from './resources.service.edge-cases-should-handle-empty-options-object.test-cases';
import { registerEdgeCasesShouldConvertSingleIdToArrayForFiltering } from './resources.service.edge-cases-should-convert-single-id-to-array-for-filtering.test-cases';
import { registerEdgeCasesShouldHandleZeroAndNegativePageNumbersGracefully } from './resources.service.edge-cases-should-handle-zero-and-negative-page-numbers-gracefully.test-cases';
import { registerEdgeCasesShouldHandleVeryLargeLimitValues } from './resources.service.edge-cases-should-handle-very-large-limit-values.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ListResourcesTestScope } from './resources.service.spec';

export function defineEdgeCasesTests(parentScope: ListResourcesTestScope) {
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
  registerEdgeCasesShouldHandleNullUndefinedOptionsGracefully(scope);

  registerEdgeCasesShouldHandleEmptyOptionsObject(scope);

  registerEdgeCasesShouldConvertSingleIdToArrayForFiltering(scope);

  registerEdgeCasesShouldHandleZeroAndNegativePageNumbersGracefully(scope);

  registerEdgeCasesShouldHandleVeryLargeLimitValues(scope);

  return scope;
}
