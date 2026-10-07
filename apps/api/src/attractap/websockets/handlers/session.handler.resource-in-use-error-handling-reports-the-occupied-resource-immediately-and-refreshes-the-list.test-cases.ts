/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { ResourceInUseErrorHandlingTestScope } from './session.handler.spec';
export function registerResourceInUseErrorHandlingReportsTheOccupiedResourceImmediatelyAndRefreshesTheList(
  scope: ResourceInUseErrorHandlingTestScope,
): void {
  it('reports the occupied resource immediately and refreshes the list', async () => {
    scope.parentScope.mockResourceUsageService.startSession.mockRejectedValueOnce(new ResourceInUseError());

    await (scope.parentScope.handler as any).handleStartResourceUsageSession(
      scope.parentScope.mockSocket,
      scope.eventData,
    );

    expect(scope.parentScope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
          payload: expect.objectContaining({ error: 'ResourceInUseError' }),
        }),
      }),
    );
    expect(scope.parentScope.mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
    expect(scope.parentScope.mockResourceListService.sendResourceListToSocket).toHaveBeenCalledWith(
      scope.parentScope.mockSocket,
      {
        resourceIds: new Set([10]),
      },
    );
  });
}
