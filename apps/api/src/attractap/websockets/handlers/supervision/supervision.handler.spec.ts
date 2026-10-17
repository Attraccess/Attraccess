import { registerAttractapSupervisionHandlerFixture } from './handler.test-fixture';
import type { SocketState } from './handler.test-fixture';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';
import { SupervisionMode } from '@attraccess/database-entities';

describe('AttractapSupervisionHandler', () => {
  const fixture = registerAttractapSupervisionHandlerFixture();

  describe('armReader', () => {
    it('arms every socket of the reader and tells it to wait for a card', async () => {
      const socket = fixture.makeSocket();
      fixture.websocketService.sockets.set('a', socket);

      await fixture.arm();

      expect(socket.state.supervisionFlow).toEqual({
        resourceId: fixture.RESOURCE_ID,
        requesterUserId: fixture.requester.id,
        requestId: 'req-1',
        approvedSupervisorUserId: null,
        webInitiated: true,
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AttractapEventType.SUPERVISION_START }),
        }),
      );
    });

    // Regression: lastAuthenticatedUserId is a sticky record of the last card ever tapped, cleared
    // only by the enrollment paths. Keying "busy" on it made every reader in real use permanently
    // unavailable, which took the whole feature offline.
    it('arms a reader that has been tapped before but is otherwise idle', async () => {
      const socket = fixture.makeSocket({ lastAuthenticatedUserId: 99 });
      fixture.websocketService.sockets.set('a', socket);

      await expect(fixture.arm()).resolves.toBeDefined();
      expect(socket.state.supervisionFlow).not.toBeNull();
    });

    it.each([
      ['enrollment', { enrollNewCardData: { key: 'k', keyNo: 1, cardUID: 'uid' } }],
      ['a card reset', { resetNfcCardData: { cardId: 1, key: 'k', keyNo: 1 } }],
      [
        'another supervision flow',
        { supervisionFlow: { resourceId: 1, requesterUserId: 1, requestId: 'other', approvedSupervisorUserId: null } },
      ],
    ])('refuses a reader busy with %s', async (_label, state) => {
      fixture.websocketService.sockets.set('a', fixture.makeSocket(state as Partial<SocketState>));

      await expect(fixture.arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a reader whose resource has a session in progress', async () => {
      fixture.websocketService.sockets.set('a', fixture.makeSocket());
      fixture.resourceUsageService.getActiveSession.mockResolvedValueOnce({ id: 5 });

      await expect(fixture.arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an offline reader', async () => {
      await expect(fixture.arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a reader with no display', async () => {
      fixture.websocketService.sockets.set('a', fixture.makeSocket());
      fixture.attractapService.findReaderById.mockResolvedValueOnce({
        id: fixture.READER_ID,
        firmware: { capabilities: { cardEnrollment: false } },
        resources: [],
      });

      await expect(fixture.arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unknown reader', async () => {
      fixture.attractapService.findReaderById.mockResolvedValueOnce(undefined);

      await expect(fixture.arm()).rejects.toBeInstanceOf(NotFoundException);
    });

    // sendMessage resolves false after exhausting its ACK retries rather than throwing, so a reader
    // that is connected but not listening used to arm "successfully" — 200 plus a 30s countdown at a
    // screen that never appeared.
    it('refuses a reader that never acknowledges, and leaves no flow behind', async () => {
      const socket = fixture.makeSocket();
      (socket.sendMessage as jest.Mock).mockResolvedValue(false);
      fixture.websocketService.sockets.set('a', socket);

      await expect(fixture.arm()).rejects.toBeInstanceOf(BadRequestException);
      expect(socket.state.supervisionFlow).toBeNull();
    });

    it('arms when at least one of the reader sockets acknowledges', async () => {
      const stale = fixture.makeSocket();
      (stale.sendMessage as jest.Mock).mockResolvedValue(false);
      const live = fixture.makeSocket();
      fixture.websocketService.sockets.set('a', stale);
      fixture.websocketService.sockets.set('b', live);

      await expect(fixture.arm()).resolves.toBeDefined();
      expect(live.state.supervisionFlow).not.toBeNull();
    });

    // The session lookup is a DB round-trip; with it after the socket check, two concurrent arms
    // both passed the check before either claimed the socket, and the second silently overwrote the
    // first — leaving the first requester with no resolution and no failure.
    it('does not let a concurrent arm overwrite an in-flight one', async () => {
      const socket = fixture.makeSocket();
      fixture.websocketService.sockets.set('a', socket);

      const results = await Promise.allSettled([fixture.arm(), fixture.arm()]);

      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    });
  });

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
});
