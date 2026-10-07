/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionSendsTheErrorMessageAndLogsWhenEndingTheSessionFails(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('sends the error message and logs when ending the session fails', async () => {
    scope.mockResourceUsageService.endSession.mockRejectedValueOnce(new Error('stop failed'));

    await (scope.handler as any).handleStopResourceUsageSession(scope.mockSocket, scope.eventData);

    expect((scope.handler as any).logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to stop resource usage session'),
    );
    expect(scope.mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
          payload: { error: 'stop failed' },
        }),
      }),
    );
  });
}
