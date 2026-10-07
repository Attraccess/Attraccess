import { AttractapEvent } from '../websocket.types';
import { registerHandleTriggerFlowButtonReturnsEarlyAndDoesNotPressTheButtonWhenTheGuardRejectsTheAction } from './session.handler.handle-trigger-flow-button-returns-early-and-does-not-press-the-button-when-the-guard-rejects-the-action.test-cases';
import { registerHandleTriggerFlowButtonPressesTheButtonAndSendsSuccess } from './session.handler.handle-trigger-flow-button-presses-the-button-and-sends-success.test-cases';
import { registerHandleTriggerFlowButtonSendsTheErrorMessageAndLogsWhenPressingTheButtonFails } from './session.handler.handle-trigger-flow-button-sends-the-error-message-and-logs-when-pressing-the-button-fails.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapSessionHandlerSessionFlowButtonTestScope } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests';

export function defineHandleTriggerFlowButtonTests(parentScope: AttractapSessionHandlerSessionFlowButtonTestScope) {
  const eventData = { payload: { resourceId: 10, buttonId: 'btn-1' } } as AttractapEvent['data'];
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
      get mockResourceFlowsExecutorService() {
        return parentScope.mockResourceFlowsExecutorService;
      },
      set mockResourceFlowsExecutorService(value: typeof parentScope.mockResourceFlowsExecutorService) {
        parentScope.mockResourceFlowsExecutorService = value;
      },
    },
    parentScope,
  );

  registerHandleTriggerFlowButtonReturnsEarlyAndDoesNotPressTheButtonWhenTheGuardRejectsTheAction(scope);

  registerHandleTriggerFlowButtonPressesTheButtonAndSendsSuccess(scope);

  registerHandleTriggerFlowButtonSendsTheErrorMessageAndLogsWhenPressingTheButtonFails(scope);

  return scope;
}
