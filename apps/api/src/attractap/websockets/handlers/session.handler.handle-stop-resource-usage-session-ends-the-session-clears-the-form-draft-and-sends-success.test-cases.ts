/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { ResourceFormAction } from '@attraccess/database-entities';
import { HandleStopResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStopResourceUsageSessionEndsTheSessionClearsTheFormDraftAndSendsSuccess(
  scope: HandleStopResourceUsageSessionTestScope,
): void {
  it('ends the session, clears the form draft and sends success', async () => {
    const formSubmissions = [{ id: 5 }];
    scope.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

    await (scope.handler as any).handleStopResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceUsageService.endSession).toHaveBeenCalledWith(
      10,
      scope.mockUser,
      { formSubmissions },
      {
        auditOrigin: { actorId: 1, authenticationMethod: null },
      },
    );
    expect(scope.mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(scope.mockSocket, 10, ResourceFormAction.END);
    expect(scope.mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
          payload: { success: true },
        }),
      }),
    );
  });
}
