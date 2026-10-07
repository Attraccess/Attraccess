/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceInUseError } from '../../../resources/usage/errors/resource-in-use.error';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { ResourceFormAction } from '@attraccess/database-entities';
import { registerAttractapSessionHandlerSessionFlowButtonFixture } from './session.handler.attractap-session-handler-session-flow-button.test-fixture';
export function registerHandleStartResourceUsageSessionCases(
  fixture: ReturnType<typeof registerAttractapSessionHandlerSessionFlowButtonFixture>,
) {
  describe('handleStartResourceUsageSession', () => {
    const eventData = { payload: { resourceId: 10, projectId: 7 } } as AttractapEvent['data'];

    it('returns early and does not start a session when the guard rejects the action', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
        undefined,
      );
      expect(fixture.mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
        socket: fixture.mockSocket,
        resourceId: 10,
        action: ResourceFormAction.START,
      });
      expect(fixture.mockUsersService.findOne).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
      fixture.mockUsersService.findOne.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockUsersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(fixture.mockResourceUsageService.startSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
    });

    it('starts the session, clears the form draft and sends success', async () => {
      const formSubmissions = [{ id: 99 }];
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockResourceUsageService.startSession).toHaveBeenCalledWith(
        10,
        fixture.mockUser,
        { projectId: 7, formSubmissions },
        { auditOrigin: { actorId: 1, authenticationMethod: null } },
      );
      expect(fixture.mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        ResourceFormAction.START,
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('attaches the supervisor and settles the web request for a two-card supervised start', async () => {
      (fixture.mockSocket.state as any).supervisionFlow = {
        resourceId: 10,
        requesterUserId: 1,
        requestId: 'req-1',
        approvedSupervisorUserId: 2,
      };

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockResourceUsageService.startSession).toHaveBeenCalledWith(
        10,
        fixture.mockUser,
        { projectId: 7, formSubmissions: [] },
        { supervisorUserId: 2, auditOrigin: { actorId: 1, authenticationMethod: null } },
      );
      expect(fixture.mockSupervisionService.settleByCard).toHaveBeenCalledWith('req-1');
      expect((fixture.mockSocket.state as any).supervisionFlow).toBeNull();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('echoes the originating request id on success and error', async () => {
      const request = { ...eventData, payload: { ...eventData.payload, requestId: 880 } };
      await fixture.handler.handleStartResourceUsageSession(fixture.mockSocket, request);
      expect(fixture.mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
        success: true,
        requestId: 880,
      });
      expect(fixture.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 880 }),
      );
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('Start failed'));
      await fixture.handler.handleStartResourceUsageSession(fixture.mockSocket, {
        ...request,
        payload: { ...request.payload, requestId: 881 },
      });
      expect(fixture.mockSocket.sendMessage.mock.calls.at(-1)[0].data.payload).toMatchObject({
        error: 'Start failed',
        requestId: 881,
      });
    });

    describe('ResourceInUseError handling', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('reports the occupied resource immediately and refreshes the list', async () => {
        fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new ResourceInUseError());

        await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

        expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
              payload: expect.objectContaining({ error: 'ResourceInUseError' }),
            }),
          }),
        );
        expect(fixture.mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
        expect(fixture.mockResourceListService.sendResourceListToSocket).toHaveBeenCalledWith(fixture.mockSocket, {
          resourceIds: new Set([10]),
        });
      });
    });

    it('sends INSUFFICIENT_BALANCE with sumUpEnabled for InsufficientBalanceError', async () => {
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new InsufficientBalanceError());
      fixture.mockSumUpService.getIsEnabled.mockResolvedValueOnce(true);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockSumUpService.getIsEnabled).toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: true },
          }),
        }),
      );
    });

    it('sends INSUFFICIENT_BALANCE for a plain error whose message is INSUFFICIENT_BALANCE', async () => {
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('INSUFFICIENT_BALANCE'));
      fixture.mockSumUpService.getIsEnabled.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockSumUpService.getIsEnabled).toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INSUFFICIENT_BALANCE', sumUpEnabled: false },
          }),
        }),
      );
    });

    it('sends the raw error message and logs for any other error', async () => {
      fixture.mockResourceUsageService.startSession.mockRejectedValueOnce(new Error('boom'));

      await (fixture.handler as any).handleStartResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockSumUpService.getIsEnabled).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start resource usage session'),
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'boom' },
          }),
        }),
      );
    });
  });
}
