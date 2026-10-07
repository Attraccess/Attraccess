/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEvent } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionKeepsTheActionSuccessfulIfTheReceiptLookupFailsAfterEndingTheSession(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('keeps the action successful if the receipt lookup fails after ending the session', async () => {
    scope.mockBillingService.getResourceUsageCharge.mockRejectedValue(new Error('billing unavailable'));
    await scope.handler.handleStopResourceUsageSession(
      scope.mockSocket as any,
      {
        payload: { resourceId: 10 },
      } as AttractapEvent['data'],
    );
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payload: { success: true } }),
      }),
    );
  });
}
