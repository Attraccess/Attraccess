/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { registerAttractapSessionHandlerSessionFlowButtonFixture } from './session.handler.attractap-session-handler-session-flow-button.test-fixture';
export function registerHandleTriggerFlowButtonCases(
  fixture: ReturnType<typeof registerAttractapSessionHandlerSessionFlowButtonFixture>,
) {
  describe('handleTriggerFlowButton', () => {
    const eventData = { payload: { resourceId: 10, buttonId: 'btn-1' } } as AttractapEvent['data'];

    it('returns early and does not press the button when the guard rejects the action', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleTriggerFlowButton(fixture.mockSocket, eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        AttractapEventType.TRIGGER_FLOW_BUTTON,
        undefined,
      );
      expect(fixture.mockResourceFlowsExecutorService.pressButton).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('presses the button and sends success', async () => {
      await (fixture.handler as any).handleTriggerFlowButton(fixture.mockSocket, eventData);

      expect(fixture.mockResourceFlowsExecutorService.pressButton).toHaveBeenCalledWith(10, 'btn-1', 1);
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.TRIGGER_FLOW_BUTTON,
            payload: { success: true },
          }),
        }),
      );
    });

    it('sends the error message and logs when pressing the button fails', async () => {
      fixture.mockResourceFlowsExecutorService.pressButton.mockRejectedValueOnce(new Error('flow boom'));

      await (fixture.handler as any).handleTriggerFlowButton(fixture.mockSocket, eventData);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to trigger flow button'),
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.TRIGGER_FLOW_BUTTON,
            payload: { error: 'flow boom' },
          }),
        }),
      );
    });
  });
}
