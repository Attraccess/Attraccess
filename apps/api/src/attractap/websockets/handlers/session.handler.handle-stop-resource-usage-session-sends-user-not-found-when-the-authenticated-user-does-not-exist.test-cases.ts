/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionSendsUserNotFoundWhenTheAuthenticatedUserDoesNotExist(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
    scope.mockUsersService.findOne.mockResolvedValueOnce(null);

    await (scope.handler as any).handleStopResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceUsageService.endSession).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
          payload: { error: 'USER_NOT_FOUND' },
        }),
      }),
    );
  });
}
