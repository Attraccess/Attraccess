import { SupervisionMode } from '@attraccess/database-entities';
import { AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { registerAttractapSupervisionHandlerFixture } from './supervision.handler.attractap-supervision-handler.test-fixture';
import { NotFoundException, BadRequestException } from '@nestjs/common';

export function registerHandleSupervisionRequestCases(
  fixture: ReturnType<typeof registerAttractapSupervisionHandlerFixture>,
) {
  describe('handleSupervisionRequest', () => {
    const request = (socket: AuthenticatedWebSocket) =>
      fixture.handler.handleSupervisionRequest(socket, {
        type: AttractapEventType.SUPERVISION_REQUEST,
        payload: { resourceId: fixture.RESOURCE_ID },
      });

    const tappedSocket = () => {
      const socket = fixture.makeSocket({ lastAuthenticatedUserId: fixture.requester.id });
      fixture.usersService.findOne.mockResolvedValue(fixture.requester);
      return socket;
    };

    const errorSent = (socket: AuthenticatedWebSocket) =>
      (socket.sendMessage as jest.Mock).mock.calls.at(-1)?.[0]?.data?.payload?.error;

    it('opens the request and answers with the supervisors to broadcast to', async () => {
      const socket = tappedSocket();

      await request(socket);

      expect(fixture.supervisionService.createReaderRequest).toHaveBeenCalled();
      expect(socket.state.supervisionFlow).toMatchObject({ requestId: 'req-1', resourceId: fixture.RESOURCE_ID });
    });

    it('refuses the request when no introducer can supervise', async () => {
      const socket = tappedSocket();
      fixture.supervisionService.getEligibleSupervisorIds.mockResolvedValue([]);

      await request(socket);

      expect(errorSent(socket)).toBe('NO_SUPERVISORS_AVAILABLE');
      expect(fixture.supervisionService.createReaderRequest).not.toHaveBeenCalled();
    });

    it('still refuses when nobody but the requester could supervise', async () => {
      const socket = tappedSocket();
      fixture.supervisionService.getEligibleSupervisorIds.mockResolvedValue([]);

      await request(socket);

      expect(errorSent(socket)).toBe('NO_SUPERVISORS_AVAILABLE');
      expect(fixture.supervisionService.createReaderRequest).not.toHaveBeenCalled();
    });

    it('refuses before anyone has tapped a card', async () => {
      const socket = fixture.makeSocket();

      await request(socket);

      expect(errorSent(socket)).toBe('USER_NOT_SET');
    });

    it('refuses a resource that does not allow supervised sessions', async () => {
      const socket = tappedSocket();
      fixture.resourceRepository.findOne.mockResolvedValue({
        id: fixture.RESOURCE_ID,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      });

      await request(socket);

      expect(errorSent(socket)).toBe('SUPERVISION_NOT_SUPPORTED');
    });
  });
}

export function registerHandleSupervisorCardAuthConfirmedCases(
  fixture: ReturnType<typeof registerAttractapSupervisionHandlerFixture>,
) {
  describe('handleSupervisorCardAuthConfirmed', () => {
    const confirm = (socket: AuthenticatedWebSocket, payload: Record<string, unknown> = {}) =>
      fixture.handler.handleSupervisorCardAuthConfirmed(socket, {
        type: AttractapEventType.SUPERVISOR_CARD_AUTH_CONFIRMED,
        payload,
      });

    const armedSocket = () =>
      fixture.makeSocket({
        supervisionFlow: {
          resourceId: fixture.RESOURCE_ID,
          requesterUserId: fixture.requester.id,
          requestId: 'req-1',
          approvedSupervisorUserId: 2,
          webInitiated: true,
        },
      });

    it('approves the pending request and leaves the reply to the armer callbacks', async () => {
      const socket = armedSocket();

      await confirm(socket, { resourceId: fixture.RESOURCE_ID });

      expect(fixture.supervisionService.approve).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ id: 2 }),
        null,
      );
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('refuses a confirmation for a different resource than the flow', async () => {
      const socket = armedSocket();

      await confirm(socket, { resourceId: 999 });

      expect(fixture.supervisionService.approve).not.toHaveBeenCalled();
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: expect.objectContaining({ error: 'RESOURCE_MISMATCH' }) }),
        }),
      );
    });

    // Otherwise the requester waits out the whole TTL for a generic timeout, and the one-arm-per
    // -requester guard keeps them from retrying until it expires.
    it('cancels the pending request when the confirmation cannot be honoured', async () => {
      const socket = armedSocket();
      fixture.usersService.findOne.mockResolvedValueOnce(null);

      await confirm(socket, { resourceId: fixture.RESOURCE_ID });

      expect(fixture.supervisionService.cancelReaderRequest).toHaveBeenCalledWith('req-1', expect.any(String));
      expect(socket.state.supervisionFlow).toBeNull();
    });

    it('cancels the pending request when approval throws', async () => {
      const socket = armedSocket();
      fixture.supervisionService.approve.mockRejectedValueOnce(new NotFoundException('gone'));

      await confirm(socket, { resourceId: fixture.RESOURCE_ID });

      expect(fixture.supervisionService.cancelReaderRequest).toHaveBeenCalledWith('req-1', expect.any(String));
    });
  });
}

export function registerHandleSupervisorCardAuthRequestCases(
  fixture: ReturnType<typeof registerAttractapSupervisionHandlerFixture>,
) {
  describe('handleSupervisorCardAuthRequest', () => {
    const authenticate = (socket: AuthenticatedWebSocket) =>
      fixture.handler.handleSupervisorCardAuthRequest(socket, {
        type: AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA,
        payload: { uid: 'supervisor-card', resourceId: fixture.RESOURCE_ID },
      });

    const armedSocket = () =>
      fixture.makeSocket({
        supervisionFlow: {
          resourceId: fixture.RESOURCE_ID,
          requesterUserId: fixture.requester.id,
          requestId: 'req-1',
          approvedSupervisorUserId: null,
        },
      });

    it('accepts an introducer card, including an applicable Resource Group introducer', async () => {
      const socket = armedSocket();
      fixture.usersService.findOne.mockResolvedValueOnce(fixture.requester);

      await authenticate(socket);

      expect(fixture.resourceUsageService.validateSupervisedStart).toHaveBeenCalledWith(
        fixture.RESOURCE_ID,
        fixture.requester,
        2,
      );
      expect(socket.state.supervisionFlow).toMatchObject({ approvedSupervisorUserId: 2 });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ keyNo: 1 }) }) }),
      );
    });

    it('rejects a maintainer-only or resource-manager-only card', async () => {
      const socket = armedSocket();
      fixture.usersService.findOne.mockResolvedValueOnce(fixture.requester);
      fixture.resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(
        new BadRequestException('not an introducer'),
      );

      await authenticate(socket);

      expect(socket.state.supervisionFlow).toMatchObject({ approvedSupervisorUserId: null });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: expect.objectContaining({ error: 'SUPERVISOR_NOT_AUTHORIZED' }) }),
        }),
      );
    });
  });
}
