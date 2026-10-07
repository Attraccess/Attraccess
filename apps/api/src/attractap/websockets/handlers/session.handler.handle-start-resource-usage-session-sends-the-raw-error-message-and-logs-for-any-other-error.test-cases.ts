/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionSendsTheRawErrorMessageAndLogsForAnyOtherError(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('sends the raw error message and logs for any other error', async () => {
    scope.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('boom'));

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockSumUpService.getIsEnabled).not.toHaveBeenCalled();
    expect((scope.handler as any).logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start resource usage session'),
    );
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
          payload: { error: 'boom' },
        }),
      }),
    );
  });
}
