import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapEvent } from '../websocket.types';
import type { AttractapSessionHandlerSessionFlowButtonTestScope } from './session.handler.spec';

export function createHandleStopResourceUsageSessionFixture(
  parentScope: AttractapSessionHandlerSessionFlowButtonTestScope,
) {
  const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

  const scope = inheritTestScope(
    {
      get mockBillingService() {
        return parentScope.mockBillingService;
      },
      set mockBillingService(value: typeof parentScope.mockBillingService) {
        parentScope.mockBillingService = value;
      },
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
      get eventData() {
        return eventData;
      },
      get mockFormsHandler() {
        return parentScope.mockFormsHandler;
      },
      set mockFormsHandler(value: typeof parentScope.mockFormsHandler) {
        parentScope.mockFormsHandler = value;
      },
      get mockUsersService() {
        return parentScope.mockUsersService;
      },
      set mockUsersService(value: typeof parentScope.mockUsersService) {
        parentScope.mockUsersService = value;
      },
      get mockUser() {
        return parentScope.mockUser;
      },
    },
    parentScope,
  );
  return scope;
}
