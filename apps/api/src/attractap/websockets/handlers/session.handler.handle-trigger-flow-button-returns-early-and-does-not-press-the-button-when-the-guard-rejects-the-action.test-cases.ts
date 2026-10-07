/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleTriggerFlowButtonTestScope } from './session.handler.spec';
export function registerHandleTriggerFlowButtonReturnsEarlyAndDoesNotPressTheButtonWhenTheGuardRejectsTheAction(
  scope: HandleTriggerFlowButtonTestScope,
): void {
  it('returns early and does not press the button when the guard rejects the action', async () => {
    scope.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

    await (scope.handler as any).handleTriggerFlowButton(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
      scope.mockSocket,
      10,
      AttractapEventType.TRIGGER_FLOW_BUTTON,
      undefined,
    );
    expect(scope.mockResourceFlowsExecutorService.pressButton).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).not.toHaveBeenCalled();
  });
}
