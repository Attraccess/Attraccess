import { registerResourceInUseErrorHandlingReportsTheOccupiedResourceImmediatelyAndRefreshesTheList } from './session.handler.resource-in-use-error-handling-reports-the-occupied-resource-immediately-and-refreshes-the-list.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests';

export function defineResourceInUseErrorHandlingTests(parentScope: HandleStartResourceUsageSessionTestScope) {
  const scope = inheritTestScope(
    {
      get parentScope() {
        return parentScope;
      },
      get eventData() {
        return parentScope.eventData;
      },
    },
    parentScope,
  );

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  registerResourceInUseErrorHandlingReportsTheOccupiedResourceImmediatelyAndRefreshesTheList(scope);

  return scope;
}
