/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceFormAction } from '@attraccess/database-entities';
import { registerAttractapSessionHandlerSessionFlowButtonFixture } from './session.handler.attractap-session-handler-session-flow-button.test-fixture';
export function registerHandleStopResourceUsageSessionCases(
  fixture: ReturnType<typeof registerAttractapSessionHandlerSessionFlowButtonFixture>,
) {
  describe('handleStopResourceUsageSession', () => {
    it('sends the final charge with configured precision and the action request ID', async () => {
      fixture.mockBillingService.getResourceUsageCharge.mockResolvedValue({ amount: -1234 });
      fixture.mockBillingService.getConfiguration.mockResolvedValue({ currency: 'KWD', minorUnit: 3 });
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10, requestId: 5 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockBillingService.getResourceUsageCharge).toHaveBeenCalledWith(99, 1);
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: {
              success: true,
              requestId: 5,
              billingSummary: { amount: 1234, total: '1,234 KWD' },
            },
          }),
        }),
      );
    });

    it.each([null, { amount: 0 }])('omits the summary for an absent or zero charge (%p)', async (charge) => {
      fixture.mockBillingService.getResourceUsageCharge.mockResolvedValue(charge);
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { success: true } }),
        }),
      );
      expect(fixture.mockBillingService.getConfiguration).not.toHaveBeenCalled();
    });

    it('does not expose another user’s charge when an administrator ends their session', async () => {
      fixture.mockResourceUsageService.endSession.mockResolvedValue({ id: 99, userId: 2 });
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockBillingService.getResourceUsageCharge).not.toHaveBeenCalled();
    });

    it('keeps the action successful if the receipt lookup fails after ending the session', async () => {
      fixture.mockBillingService.getResourceUsageCharge.mockRejectedValue(new Error('billing unavailable'));
      await fixture.handler.handleStopResourceUsageSession(
        fixture.mockSocket as any,
        {
          payload: { resourceId: 10 },
        } as AttractapEvent['data'],
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: { success: true } }),
        }),
      );
    });
    const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it('returns early and does not end a session when the guard rejects the action', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValueOnce(false);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockResourceActionGuard.validateResourceAction).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
        undefined,
      );
      expect(fixture.mockFormsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early when forms are not satisfied (ensureFormsSatisfied returns null)', async () => {
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockFormsHandler.ensureFormsSatisfied).toHaveBeenCalledWith({
        socket: fixture.mockSocket,
        resourceId: 10,
        action: ResourceFormAction.END,
      });
      expect(fixture.mockUsersService.findOne).not.toHaveBeenCalled();
      expect(fixture.mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_FOUND when the authenticated user does not exist', async () => {
      fixture.mockUsersService.findOne.mockResolvedValueOnce(null);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockResourceUsageService.endSession).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
    });

    it('ends the session, clears the form draft and sends success', async () => {
      const formSubmissions = [{ id: 5 }];
      fixture.mockFormsHandler.ensureFormsSatisfied.mockResolvedValueOnce(formSubmissions);

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, eventData);

      expect(fixture.mockResourceUsageService.endSession).toHaveBeenCalledWith(
        10,
        fixture.mockUser,
        { formSubmissions },
        {
          auditOrigin: { actorId: 1, authenticationMethod: null },
        },
      );
      expect(fixture.mockFormsHandler.clearFormDraft).toHaveBeenCalledWith(
        fixture.mockSocket,
        10,
        ResourceFormAction.END,
      );
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { success: true },
          }),
        }),
      );
    });

    it('sends the error message and logs when ending the session fails', async () => {
      fixture.mockResourceUsageService.endSession.mockRejectedValueOnce(new Error('stop failed'));

      await (fixture.handler as any).handleStopResourceUsageSession(fixture.mockSocket, eventData);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop resource usage session'),
      );
      expect(fixture.mockFormsHandler.clearFormDraft).not.toHaveBeenCalled();
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.STOP_RESOURCE_USAGE_SESSION,
            payload: { error: 'stop failed' },
          }),
        }),
      );
    });
  });
}
