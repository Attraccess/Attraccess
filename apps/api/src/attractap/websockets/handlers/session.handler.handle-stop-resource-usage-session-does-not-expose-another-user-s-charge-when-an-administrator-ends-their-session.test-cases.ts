/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEvent } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionDoesNotExposeAnotherUserSChargeWhenAnAdministratorEndsTheirSession(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('does not expose another user’s charge when an administrator ends their session', async () => {
    scope.mockResourceUsageService.endSession.mockResolvedValue({ id: 99, userId: 2 });
    await scope.handler.handleStopResourceUsageSession(
      scope.mockSocket as any,
      {
        payload: { resourceId: 10 },
      } as AttractapEvent['data'],
    );
    expect(scope.mockBillingService.getResourceUsageCharge).not.toHaveBeenCalled();
  });
}
