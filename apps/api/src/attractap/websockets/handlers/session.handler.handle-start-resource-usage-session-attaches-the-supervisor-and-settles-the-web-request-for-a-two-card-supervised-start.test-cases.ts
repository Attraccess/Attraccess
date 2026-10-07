/* eslint-disable @typescript-eslint/no-explicit-any -- Preserve the original handler test policy for partial protocol mocks. */
import { AttractapEventType } from '../websocket.types';
import { HandleStartResourceUsageSessionTestScope } from './session.handler.spec';
export function registerHandleStartResourceUsageSessionAttachesTheSupervisorAndSettlesTheWebRequestForATwoCardSupervisedStart(
  scope: HandleStartResourceUsageSessionTestScope,
): void {
  it('attaches the supervisor and settles the web request for a two-card supervised start', async () => {
    (scope.mockSocket.state as any).supervisionFlow = {
      resourceId: 10,
      requesterUserId: 1,
      requestId: 'req-1',
      approvedSupervisorUserId: 2,
    };

    await (scope.handler as any).handleStartResourceUsageSession(scope.mockSocket, scope.eventData);

    expect(scope.mockResourceUsageService.startSession).toHaveBeenCalledWith(
      10,
      scope.mockUser,
      { projectId: 7, formSubmissions: [] },
      { supervisorUserId: 2, auditOrigin: { actorId: 1, authenticationMethod: null } },
    );
    expect(scope.mockSupervisionService.settleByCard).toHaveBeenCalledWith('req-1');
    expect((scope.mockSocket.state as any).supervisionFlow).toBeNull();
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
