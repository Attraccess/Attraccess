/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionReturnsEarlyAndDoesNotStartASessionWhenTheGuardRejectsTheAction(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('returns early and does not start a session when the guard rejects the action', async () => {
    scope.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
      scope.mockSocket,
      10,
      AttractapEventType.START_RESOURCE_USAGE_SESSION,
      undefined,
    );
    expect(scope.mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
    expect(scope.mockResourceUsageService.startSession).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).not.toHaveBeenCalled();
  });
}
