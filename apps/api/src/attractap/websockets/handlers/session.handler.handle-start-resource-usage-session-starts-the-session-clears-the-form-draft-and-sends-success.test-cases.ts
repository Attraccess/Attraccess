/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { ResourceFormAction } from '@attraccess/database-entities';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionStartsTheSessionClearsTheFormDraftAndSendsSuccess(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('starts the session, clears the form draft and sends success', async () => {
    const formSubmissions = [{ id: 99 }];
    scope.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceUsageService.startSession).toHaveBeenCalledWith(
      10,
      scope.mockUser,
      { projectId: 7, formSubmissions },
      { auditOrigin: { actorId: 1, authenticationMethod: null } },
    );
    expect(scope.mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(scope.mockSocket, 10, ResourceFormAction.START);
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
          payload: { success: true },
        }),
      }),
    );
  });
}
