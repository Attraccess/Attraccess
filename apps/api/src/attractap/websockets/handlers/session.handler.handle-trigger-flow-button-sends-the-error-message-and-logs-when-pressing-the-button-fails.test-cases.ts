/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleTriggerFlowButtonTestScope } from './session.handler.spec';
export function registerHandleTriggerFlowButtonSendsTheErrorMessageAndLogsWhenPressingTheButtonFails(
  scope: HandleTriggerFlowButtonTestScope,
): void {
  it('sends the error message and logs when pressing the button fails', async () => {
    scope.mockResourceFlowsExecutorService.pressButton.mockRejectedValueOnce(new Error('flow boom'));

    await (scope.handler as any).handleTriggerFlowButton(scope.mockSocket, scope.eventData);

    expect((scope.handler as any).logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to trigger flow button'),
    );
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.TRIGGER_FLOW_BUTTON,
          payload: { error: 'flow boom' },
        }),
      }),
    );
  });
}
