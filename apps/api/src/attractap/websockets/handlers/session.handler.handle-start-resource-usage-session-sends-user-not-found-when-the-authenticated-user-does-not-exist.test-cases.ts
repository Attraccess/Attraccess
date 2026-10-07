/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionSendsUserNotFoundWhenTheAuthenticatedUserDoesNotExist(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
    scope.mockUsersService.findOne.mockResolvedValueOnce(null);

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockUsersService.findOne).toHaveBeenCalledWith({ id: 1 });
    expect(scope.mockResourceUsageService.startSession).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
          payload: { error: 'USER_NOT_FOUND' },
        }),
      }),
    );
  });
}
