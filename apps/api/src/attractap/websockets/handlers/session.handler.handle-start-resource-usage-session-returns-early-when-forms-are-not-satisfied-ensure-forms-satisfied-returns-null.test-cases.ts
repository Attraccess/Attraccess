/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { ResourceFormAction } from '@attraccess/database-entities';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionReturnsEarlyWhenFormsAreNotSatisfiedEnsureFormsSatisfiedReturnsNull(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
    scope.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
      socket: scope.mockSocket,
      resourceId: 10,
      action: ResourceFormAction.START,
    });
    expect(scope.mockUsersService.findOne).not.toHaveBeenCalled();
    expect(scope.mockResourceUsageService.startSession).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).not.toHaveBeenCalled();
  });
}
