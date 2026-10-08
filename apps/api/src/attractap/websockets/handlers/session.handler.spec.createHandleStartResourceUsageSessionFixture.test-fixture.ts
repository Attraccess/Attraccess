import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapEvent } from '../websocket.types';
import type { AttractapSessionHandlerSessionFlowButtonTestScope } from './session.handler.spec';

export function createHandleStartResourceUsageSessionFixture(
  parentScope: AttractapSessionHandlerSessionFlowButtonTestScope,
) {
  const eventData = { payload: { resourceId: 10, projectId: 7 } } as AttractapEvent['data'];

  const scope = inheritTestScope(
    {
      get mockResourceActionGuard() {
        return parentScope.mockResourceActionGuard;
      },
      set mockResourceActionGuard(value: typeof parentScope.mockResourceActionGuard) {
        parentScope.mockResourceActionGuard = value;
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
      get eventData() {
        return eventData;
      },
      get mockFormsHandler() {
        return parentScope.mockFormsHandler;
      },
      set mockFormsHandler(value: typeof parentScope.mockFormsHandler) {
        parentScope.mockFormsHandler = value;
      },
      get mockResourceUsageService() {
        return parentScope.mockResourceUsageService;
      },
      set mockResourceUsageService(value: typeof parentScope.mockResourceUsageService) {
        parentScope.mockResourceUsageService = value;
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
      get mockSupervisionService() {
        return parentScope.mockSupervisionService;
      },
      set mockSupervisionService(value: typeof parentScope.mockSupervisionService) {
        parentScope.mockSupervisionService = value;
      },
      get mockSumUpService() {
        return parentScope.mockSumUpService;
      },
      set mockSumUpService(value: typeof parentScope.mockSumUpService) {
        parentScope.mockSumUpService = value;
      },
    },
    parentScope,
  );
  return scope;
}
