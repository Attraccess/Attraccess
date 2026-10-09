/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { inheritTestScope } from '../../../../../test-utils/inherit-test-scope';
import type { AttractapSessionHandlerSessionFlowButtonTestScope } from '../session.handler.spec';

export function createLiveUsageStatsFixture(parentScope: AttractapSessionHandlerSessionFlowButtonTestScope) {
  const request = { payload: { resourceId: 10, requestId: 7 } } as any;

  const startTime = new Date('2026-10-03T10:00:00Z');

  const scope = inheritTestScope(
    {
      get handler() {
        return parentScope.handler;
      },
      set handler(value: typeof parentScope.handler) {
        parentScope.handler = value;
      },
      get mockSocket() {
        return parentScope.mockSocket;
      },
      set mockSocket(value: typeof parentScope.mockSocket) {
        parentScope.mockSocket = value;
      },
      get request() {
        return request;
      },
      get operating() {
        return parentScope.operating;
      },
      get startTime() {
        return startTime;
      },
      get mockBillingService() {
        return parentScope.mockBillingService;
      },
      set mockBillingService(value: typeof parentScope.mockBillingService) {
        parentScope.mockBillingService = value;
      },
      get metering() {
        return parentScope.metering;
      },
      get mockResourceUsageService() {
        return parentScope.mockResourceUsageService;
      },
      set mockResourceUsageService(value: typeof parentScope.mockResourceUsageService) {
        parentScope.mockResourceUsageService = value;
      },
      get mockResourceActionGuard() {
        return parentScope.mockResourceActionGuard;
      },
      set mockResourceActionGuard(value: typeof parentScope.mockResourceActionGuard) {
        parentScope.mockResourceActionGuard = value;
      },
    },
    parentScope,
  );
  return scope;
}
