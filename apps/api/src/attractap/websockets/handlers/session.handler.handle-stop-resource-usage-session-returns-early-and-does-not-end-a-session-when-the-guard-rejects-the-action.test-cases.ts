/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionReturnsEarlyAndDoesNotEndASessionWhenTheGuardRejectsTheAction(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('returns early and does not end a session when the guard rejects the action', async () => {
    scope.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

    await (scope.handler as any).handleStopResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
      scope.mockSocket,
      10,
      AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
      undefined,
    );
    expect(scope.mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
    expect(scope.mockResourceUsageService.endSession).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).not.toHaveBeenCalled();
  });
}
