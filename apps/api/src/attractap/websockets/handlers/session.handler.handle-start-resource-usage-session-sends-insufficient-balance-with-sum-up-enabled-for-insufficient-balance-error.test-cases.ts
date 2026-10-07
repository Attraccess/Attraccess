/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionSendsInsufficientBalanceWithSumUpEnabledForInsufficientBalanceError(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('sends INSUFFICIENT_BALANCE with sumUpEnabled for InsufficientBalanceError', async () => {
    scope.mockResourceUsageService.startSession.mockRejectedValueOnce(new InsufficientBalanceError());
    scope.mockSumUpService.getIsEnabled.mockResolvedValueOnce(true);

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockSumUpService.getIsEnabled).toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
          payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: true },
        }),
      }),
    );
  });
}
