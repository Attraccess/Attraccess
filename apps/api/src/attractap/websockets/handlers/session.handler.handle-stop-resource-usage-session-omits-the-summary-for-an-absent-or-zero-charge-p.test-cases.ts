/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEvent } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionOmitsTheSummaryForAnAbsentOrZeroChargeP(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it.each([null, { amount: 0 }])('omits the summary for an absent or zero charge (%p)', async (charge) => {
    scope.mockBillingService.getResourceUsageCharge.mockResolvedValue(charge);
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
    expect(scope.mockBillingService.getConfiguration).not.toHaveBeenCalled();
  });
}
