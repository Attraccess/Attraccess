/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionSendsInsufficientBalanceForAPlainErrorWhoseMessageIsInsufficientBalance(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('sends INSUFFICIENT_BALANCE for a plain error whose message is INSUFFICIENT_BALANCE', async () => {
    scope.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('INSUFFICIENT_BALANCE'));
    scope.mockSumUpService.getIsEnabled.mockResolvedValueOnce(false);

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockSumUpService.getIsEnabled).toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
          payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: false },
        }),
      }),
    );
  });
}
