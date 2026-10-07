/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleTriggerFlowButtonTestScope } from './session.handler.spec';
export function registerHandleTriggerFlowButtonPressesTheButtonAndSendsSuccess(
  scope: HandleTriggerFlowButtonTestScope,
): void {
  it('presses the button and sends success', async () => {
    await (scope.handler as any).handleTriggerFlowButton(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceFlowsExecutorService.pressButton).toHaveBeenCalledWith(10, 'btn-1', 1);
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.TRIGGER_FLOW_BUTTON,
          payload: { success: true },
        }),
      }),
    );
  });
}
