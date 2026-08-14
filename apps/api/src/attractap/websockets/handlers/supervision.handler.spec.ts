import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SupervisionMode, User } from '@attraccess/database-entities';
import { AttractapSupervisionHandler } from './supervision.handler';
import { AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';

type SocketState = AuthenticatedWebSocket['state'];

describe('AttractapSupervisionHandler', () => {
  let handler: AttractapSupervisionHandler;
  let attractapService: { findReaderById: jest.Mock };
  let websocketService: { sockets: Map<string, AuthenticatedWebSocket> };
  let resourceUsageService: { getActiveSession: jest.Mock; validateSupervisedStart: jest.Mock };
  let supervisionService: {
    setReaderArmer: jest.Mock;
    approve: jest.Mock;
    cancelReaderRequest: jest.Mock;
    getEligibleSupervisorIds: jest.Mock;
    createReaderRequest: jest.Mock;
  };
  let usersService: { findOne: jest.Mock };
  let resourceRepository: { findOne: jest.Mock };

  const requester = { id: 1, username: 'requester' } as User;
  const READER_ID = 3;
  const RESOURCE_ID = 42;

  const makeSocket = (state: Partial<SocketState> = {}): AuthenticatedWebSocket =>
    ({
      id: 'socket-1',
      readerId: READER_ID,
      sendMessage: jest.fn().mockResolvedValue(true),
      state: {
        lastAuthenticatedUserId: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        supervisionFlow: null,
        ...state,
      },
    } as unknown as AuthenticatedWebSocket);

  const arm = () =>
    // The armer is registered on module init; go through the same port the service uses.
    (handler as unknown as { armReader: (p: unknown) => Promise<unknown> }).armReader({
      readerId: READER_ID,
      resourceId: RESOURCE_ID,
      requester,
      requestId: 'req-1',
    });

  beforeEach(() => {
    attractapService = {
      findReaderById: jest.fn().mockResolvedValue({
        id: READER_ID,
        firmware: { capabilities: { cardEnrollment: true } },
        resources: [{ id: RESOURCE_ID }],
      }),
    };
    websocketService = { sockets: new Map() };
    resourceUsageService = {
      getActiveSession: jest.fn().mockResolvedValue(null),
      validateSupervisedStart: jest.fn().mockResolvedValue(undefined),
    };
    supervisionService = {
      setReaderArmer: jest.fn(),
      approve: jest.fn().mockResolvedValue({ id: 7 }),
      cancelReaderRequest: jest.fn(),
      getEligibleSupervisorIds: jest.fn().mockResolvedValue([2]),
      createReaderRequest: jest.fn().mockReturnValue({ requestId: 'req-1', expiresAt: new Date(0) }),
    };
    usersService = { findOne: jest.fn().mockResolvedValue({ id: 2, username: 'supervisor' }) };
    resourceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: RESOURCE_ID, supervisionMode: SupervisionMode.SUPERVISION_REQUIRED }),
    };

    handler = new AttractapSupervisionHandler();
    Object.assign(handler, {
      attractapService,
      websocketService,
      resourceUsageService,
      supervisionService,
      usersService,
      resourceRepository,
    });
  });

  describe('armReader', () => {
    it('arms every socket of the reader and tells it to wait for a card', async () => {
      const socket = makeSocket();
      websocketService.sockets.set('a', socket);

      await arm();

      expect(socket.state.supervisionFlow).toEqual({
        resourceId: RESOURCE_ID,
        requesterUserId: requester.id,
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
      const socket = makeSocket({ lastAuthenticatedUserId: 99 });
      websocketService.sockets.set('a', socket);

      await expect(arm()).resolves.toBeDefined();
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
      websocketService.sockets.set('a', makeSocket(state as Partial<SocketState>));

      await expect(arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a reader whose resource has a session in progress', async () => {
      websocketService.sockets.set('a', makeSocket());
      resourceUsageService.getActiveSession.mockResolvedValueOnce({ id: 5 });

      await expect(arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an offline reader', async () => {
      await expect(arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a reader with no display', async () => {
      websocketService.sockets.set('a', makeSocket());
      attractapService.findReaderById.mockResolvedValueOnce({
        id: READER_ID,
        firmware: { capabilities: { cardEnrollment: false } },
        resources: [],
      });

      await expect(arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unknown reader', async () => {
      attractapService.findReaderById.mockResolvedValueOnce(undefined);

      await expect(arm()).rejects.toBeInstanceOf(NotFoundException);
    });

    // sendMessage resolves false after exhausting its ACK retries rather than throwing, so a reader
    // that is connected but not listening used to arm "successfully" — 200 plus a 30s countdown at a
    // screen that never appeared.
    it('refuses a reader that never acknowledges, and leaves no flow behind', async () => {
      const socket = makeSocket();
      (socket.sendMessage as jest.Mock).mockResolvedValue(false);
      websocketService.sockets.set('a', socket);

      await expect(arm()).rejects.toBeInstanceOf(BadRequestException);
      expect(socket.state.supervisionFlow).toBeNull();
    });

    it('arms when at least one of the reader sockets acknowledges', async () => {
      const stale = makeSocket();
      (stale.sendMessage as jest.Mock).mockResolvedValue(false);
      const live = makeSocket();
      websocketService.sockets.set('a', stale);
      websocketService.sockets.set('b', live);

      await expect(arm()).resolves.toBeDefined();
      expect(live.state.supervisionFlow).not.toBeNull();
    });

    // The session lookup is a DB round-trip; with it after the socket check, two concurrent arms
    // both passed the check before either claimed the socket, and the second silently overwrote the
    // first — leaving the first requester with no resolution and no failure.
    it('does not let a concurrent arm overwrite an in-flight one', async () => {
      const socket = makeSocket();
      websocketService.sockets.set('a', socket);

      const results = await Promise.allSettled([arm(), arm()]);

      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    });
  });

  describe('handleSupervisionRequest', () => {
    const request = (socket: AuthenticatedWebSocket) =>
      handler.handleSupervisionRequest(socket, {
        type: AttractapEventType.SUPERVISION_REQUEST,
        payload: { resourceId: RESOURCE_ID },
      });

    const tappedSocket = () => {
      const socket = makeSocket({ lastAuthenticatedUserId: requester.id });
      usersService.findOne.mockResolvedValue(requester);
      return socket;
    };

    const errorSent = (socket: AuthenticatedWebSocket) =>
      (socket.sendMessage as jest.Mock).mock.calls.at(-1)?.[0]?.data?.payload?.error;

    it('opens the request and answers with the supervisors to broadcast to', async () => {
      const socket = tappedSocket();

      await request(socket);

      expect(supervisionService.createReaderRequest).toHaveBeenCalled();
      expect(socket.state.supervisionFlow).toMatchObject({ requestId: 'req-1', resourceId: RESOURCE_ID });
    });

    // ATT-867: the reader screen closed itself a second after opening on any resource without
    // introducers. getEligibleSupervisorIds() now falls back to the global resource managers for
    // exactly that case, so a non-empty list here can be manager-only and the request opens.
    it('opens the request when only a resource manager could supervise', async () => {
      const socket = tappedSocket();
      supervisionService.getEligibleSupervisorIds.mockResolvedValue([42]);

      await request(socket);

      expect(errorSent(socket)).toBeUndefined();
      expect(supervisionService.createReaderRequest).toHaveBeenCalled();
    });

    it('still refuses when nobody but the requester could supervise', async () => {
      const socket = tappedSocket();
      supervisionService.getEligibleSupervisorIds.mockResolvedValue([]);

      await request(socket);

      expect(errorSent(socket)).toBe('NO_SUPERVISORS_AVAILABLE');
      expect(supervisionService.createReaderRequest).not.toHaveBeenCalled();
    });

    it('refuses before anyone has tapped a card', async () => {
      const socket = makeSocket();

      await request(socket);

      expect(errorSent(socket)).toBe('USER_NOT_SET');
    });

    it('refuses a resource that does not allow supervised sessions', async () => {
      const socket = tappedSocket();
      resourceRepository.findOne.mockResolvedValue({
        id: RESOURCE_ID,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      });

      await request(socket);

      expect(errorSent(socket)).toBe('SUPERVISION_NOT_SUPPORTED');
    });
  });

  describe('handleSupervisorCardAuthConfirmed', () => {
    const confirm = (socket: AuthenticatedWebSocket, payload: Record<string, unknown> = {}) =>
      handler.handleSupervisorCardAuthConfirmed(socket, {
        type: AttractapEventType.SUPERVISOR_CARD_AUTH_CONFIRMED,
        payload,
      });

    const armedSocket = () =>
      makeSocket({
        supervisionFlow: {
          resourceId: RESOURCE_ID,
          requesterUserId: requester.id,
          requestId: 'req-1',
          approvedSupervisorUserId: 2,
          webInitiated: true,
        },
      });

    it('approves the pending request and leaves the reply to the armer callbacks', async () => {
      const socket = armedSocket();

      await confirm(socket, { resourceId: RESOURCE_ID });

      expect(supervisionService.approve).toHaveBeenCalledWith('req-1', expect.objectContaining({ id: 2 }));
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('refuses a confirmation for a different resource than the flow', async () => {
      const socket = armedSocket();

      await confirm(socket, { resourceId: 999 });

      expect(supervisionService.approve).not.toHaveBeenCalled();
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
      usersService.findOne.mockResolvedValueOnce(null);

      await confirm(socket, { resourceId: RESOURCE_ID });

      expect(supervisionService.cancelReaderRequest).toHaveBeenCalledWith('req-1', expect.any(String));
      expect(socket.state.supervisionFlow).toBeNull();
    });

    it('cancels the pending request when approval throws', async () => {
      const socket = armedSocket();
      supervisionService.approve.mockRejectedValueOnce(new NotFoundException('gone'));

      await confirm(socket, { resourceId: RESOURCE_ID });

      expect(supervisionService.cancelReaderRequest).toHaveBeenCalledWith('req-1', expect.any(String));
    });
  });
});
