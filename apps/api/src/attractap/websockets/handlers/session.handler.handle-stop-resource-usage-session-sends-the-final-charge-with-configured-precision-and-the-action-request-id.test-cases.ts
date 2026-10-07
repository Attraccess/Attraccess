/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEvent } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionSendsTheFinalChargeWithConfiguredPrecisionAndTheActionRequestId(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('sends the final charge with configured precision and the action request ID', async () => {
    scope.mockBillingService.getResourceUsageCharge.mockResolvedValue({ amount: -1234 });
    scope.mockBillingService.getConfiguration.mockResolvedValue({ currency: 'KWD', minorUnit: 3 });
    await scope.handler.handleStopResourceUsageSession(
      scope.mockSocket as any,
      {
        payload: { resourceId: 10, requestId: 5 },
      } as AttractapEvent['data'],
    );
    expect(scope.mockBillingService.getResourceUsageCharge).toHaveBeenCalledWith(99, 1);
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            success: true,
            requestId: 5,
            billingSummary: { amount: 1234, total: '1,234 KWD' },
          },
        }),
      }),
    );
  });
}
