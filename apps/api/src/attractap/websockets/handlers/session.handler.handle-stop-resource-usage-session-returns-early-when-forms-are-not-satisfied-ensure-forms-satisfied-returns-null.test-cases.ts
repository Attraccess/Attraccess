/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { ResourceFormAction } from '@attraccess/database-entities';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionReturnsEarlyWhenFormsAreNotSatisfiedEnsureFormsSatisfiedReturnsNull(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
    scope.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

    await (scope.handler as any).handleStopResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
      socket: scope.mockSocket,
      resourceId: 10,
      action: ResourceFormAction.END,
    });
    expect(scope.mockUsersService.findOne).not.toHaveBeenCalled();
    expect(scope.mockResourceUsageService.endSession).not.toHaveBeenCalled();
    expect(scope.mockSocket.sendMessage).not.toHaveBeenCalled();
  });
}
