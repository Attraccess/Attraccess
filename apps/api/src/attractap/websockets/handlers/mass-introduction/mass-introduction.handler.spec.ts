import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MassIntroductionEndReason } from '../../../../resources/mass-introductions/dtos/massIntroductionLiveEvent.dto';
import { AttractapEventType, AuthenticatedWebSocket } from '../../websocket.types';
import { AttractapMassIntroductionHandler } from './mass-introduction.handler';

type SocketState = AuthenticatedWebSocket['state'];

describe('AttractapMassIntroductionHandler', () => {
  const READER_ID = 3;
  const SESSION_ID = 'session-1';
  const UID = '04aabbccddeeff';

  let handler: AttractapMassIntroductionHandler;
  let attractapService: { findReaderById: jest.Mock; getNFCCardByUID: jest.Mock };
  let websocketService: { sockets: Map<string, AuthenticatedWebSocket> };
  let resourceUsageService: { getActiveSession: jest.Mock };
  let massIntroductionService: { setReaderPort: jest.Mock; redeemCard: jest.Mock; detachReader: jest.Mock };

  const makeSocket = (state: Partial<SocketState> = {}, id = 'socket-1'): AuthenticatedWebSocket =>
    ({
      id,
      readerId: READER_ID,
      sendMessage: jest.fn().mockResolvedValue(true),
      state: {
        lastAuthenticatedUserId: null,
        enrollment: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        supervisionFlow: null,
        massIntroductionFlow: null,
        ...state,
      },
    }) as unknown as AuthenticatedWebSocket;

  const sent = (socket: AuthenticatedWebSocket) =>
    (socket.sendMessage as jest.Mock).mock.calls.map(([message]) => ({
      type: message.data.type,
      payload: message.data.payload,
    }));

  const port = () => massIntroductionService.setReaderPort.mock.calls[0][0];
  const arm = () =>
    port().arm({
      readerId: READER_ID,
      sessionId: SESSION_ID,
      targetName: 'Laser',
      introducerUsername: 'tutor',
      expiresAt: new Date(Date.now() + 60_000),
    });
  const event = (payload: unknown) => ({ type: AttractapEventType.MASS_INTRODUCTION_CANCEL, payload });

  beforeEach(() => {
    attractapService = {
      findReaderById: jest.fn().mockResolvedValue({
        id: READER_ID,
        name: 'Entrance',
        firmware: { capabilities: { cardEnrollment: true } },
        resources: [{ id: 42 }],
      }),
      getNFCCardByUID: jest.fn().mockResolvedValue({
        isActive: true,
        keyNo: 1,
        key: 'secret',
        user: { id: 7, username: 'alice' },
      }),
    };
    websocketService = { sockets: new Map() };
    resourceUsageService = { getActiveSession: jest.fn().mockResolvedValue(null) };
    massIntroductionService = {
      setReaderPort: jest.fn(),
      redeemCard: jest.fn().mockResolvedValue({
        participant: { username: 'alice', alreadyIntroduced: false },
        participantCount: 1,
      }),
      detachReader: jest.fn(),
    };

    handler = new AttractapMassIntroductionHandler();
    Object.assign(handler, { attractapService, websocketService, resourceUsageService, massIntroductionService });
    handler.onModuleInit();
  });

  describe('arming', () => {
    it('shows the scan screen on every socket of the reader', async () => {
      const socket = makeSocket();
      websocketService.sockets.set('a', socket);

      await expect(arm()).resolves.toEqual({ readerName: 'Entrance' });

      expect(socket.state.massIntroductionFlow).toEqual({ sessionId: SESSION_ID, pendingCard: null });
      const [start] = sent(socket);
      expect(start.type).toBe(AttractapEventType.MASS_INTRODUCTION_START);
      expect(start.payload).toEqual(
        expect.objectContaining({ sessionId: SESSION_ID, targetName: 'Laser', introducerUsername: 'tutor' }),
      );
      expect(start.payload.remainingMs).toBeGreaterThan(0);
    });

    it('rejects readers whose firmware lacks the capability', async () => {
      attractapService.findReaderById.mockResolvedValue({ id: READER_ID, firmware: { capabilities: {} } });
      websocketService.sockets.set('a', makeSocket());

      await expect(arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown and offline readers', async () => {
      await expect(arm()).rejects.toBeInstanceOf(BadRequestException);
      attractapService.findReaderById.mockResolvedValue(null);
      await expect(arm()).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each<[string, Partial<SocketState>]>([
      ['mass introduction', { massIntroductionFlow: { sessionId: 'other', pendingCard: null } }],
      [
        'supervision',
        { supervisionFlow: { resourceId: 1, requesterUserId: 1, requestId: 'r', approvedSupervisorUserId: null } },
      ],
      [
        'card enrollment',
        { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
      ],
    ])('refuses a reader busy with %s', async (_name, state) => {
      websocketService.sockets.set('a', makeSocket(state));

      await expect(arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a reader with a usage session in progress', async () => {
      websocketService.sockets.set('a', makeSocket());
      resourceUsageService.getActiveSession.mockResolvedValue({ id: 1 });

      await expect(arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('releases the reader when it never acknowledges the start', async () => {
      const socket = makeSocket();
      (socket.sendMessage as jest.Mock).mockResolvedValue(false);
      websocketService.sockets.set('a', socket);

      await expect(arm()).rejects.toBeInstanceOf(BadRequestException);
      expect(socket.state.massIntroductionFlow).toBeNull();
    });

    it('reports a reader that refused the start while it was being acknowledged', async () => {
      const socket = makeSocket();
      (socket.sendMessage as jest.Mock).mockImplementation(async () => {
        await handler.handleCancel(socket);
        return true;
      });
      websocketService.sockets.set('a', socket);

      await expect(arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the reader to normal when the session ends', async () => {
      const socket = makeSocket();
      websocketService.sockets.set('a', socket);
      await arm();

      port().disarm({ readerId: READER_ID, sessionId: SESSION_ID, reason: MassIntroductionEndReason.EXPIRED });

      expect(socket.state.massIntroductionFlow).toBeNull();
      expect(sent(socket).at(-1)).toEqual({
        type: AttractapEventType.MASS_INTRODUCTION_END,
        payload: { sessionId: SESSION_ID, reason: MassIntroductionEndReason.EXPIRED },
      });
    });
  });

  describe('card taps', () => {
    it('hands out the card key, then introduces the owner once the reader confirms', async () => {
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });

      await handler.handleCardAuthRequest(socket, event({ sessionId: SESSION_ID, uid: UID }));
      await handler.handleCardAuthConfirmed(socket, event({ sessionId: SESSION_ID, uid: UID }));

      expect(sent(socket)).toEqual([
        {
          type: AttractapEventType.MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA,
          payload: { sessionId: SESSION_ID, keyNo: 1, key: 'secret', username: 'alice' },
        },
        {
          type: AttractapEventType.MASS_INTRODUCTION_RESULT,
          payload: {
            sessionId: SESSION_ID,
            success: true,
            username: 'alice',
            alreadyIntroduced: false,
            participantCount: 1,
          },
        },
      ]);
      expect(massIntroductionService.redeemCard).toHaveBeenCalledWith(SESSION_ID, READER_ID, {
        id: 7,
        username: 'alice',
      });
      expect(socket.state.massIntroductionFlow?.pendingCard).toBeNull();
    });

    it('never introduces without a preceding key request for the same card', async () => {
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });

      await handler.handleCardAuthConfirmed(socket, event({ sessionId: SESSION_ID, uid: UID }));
      await handler.handleCardAuthRequest(socket, event({ sessionId: SESSION_ID, uid: UID }));
      await handler.handleCardAuthConfirmed(socket, event({ sessionId: SESSION_ID, uid: 'another-card' }));

      expect(massIntroductionService.redeemCard).not.toHaveBeenCalled();
      expect(sent(socket).filter((m) => m.type === AttractapEventType.MASS_INTRODUCTION_RESULT)).toEqual([
        expect.objectContaining({ payload: expect.objectContaining({ success: false, error: 'CARD_MISMATCH' }) }),
        expect.objectContaining({ payload: expect.objectContaining({ success: false, error: 'CARD_MISMATCH' }) }),
      ]);
    });

    it.each([
      ['unknown cards', null, 'CARD_NOT_FOUND'],
      ['inactive cards', { isActive: false, user: { id: 7 } }, 'CARD_NOT_ACTIVE'],
    ])('rejects %s', async (_name, card, error) => {
      attractapService.getNFCCardByUID.mockResolvedValue(card);
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });

      await handler.handleCardAuthRequest(socket, event({ sessionId: SESSION_ID, uid: UID }));

      expect(sent(socket)[0].payload).toEqual({ sessionId: SESSION_ID, error });
    });

    it('rejects taps for a session the reader is not showing', async () => {
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });

      await handler.handleCardAuthRequest(socket, event({ sessionId: 'stale', uid: UID }));

      expect(sent(socket)[0].payload).toEqual({ sessionId: 'stale', error: 'NO_MASS_INTRODUCTION_IN_PROGRESS' });
    });

    it('reports a session that ended while the card was authenticated', async () => {
      massIntroductionService.redeemCard.mockRejectedValue(new NotFoundException());
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });

      await handler.handleCardAuthRequest(socket, event({ sessionId: SESSION_ID, uid: UID }));
      await handler.handleCardAuthConfirmed(socket, event({ sessionId: SESSION_ID, uid: UID }));

      expect(sent(socket).at(-1)?.payload).toEqual({
        sessionId: SESSION_ID,
        success: false,
        error: 'NO_MASS_INTRODUCTION_IN_PROGRESS',
      });
    });
  });

  describe('leaving', () => {
    it('detaches the reader from the session when it cancels', async () => {
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });

      await handler.handleCancel(socket);

      expect(socket.state.massIntroductionFlow).toBeNull();
      expect(massIntroductionService.detachReader).toHaveBeenCalledWith(SESSION_ID, READER_ID);
    });

    it('uses the reader id captured before disconnect cleanup cleared it', () => {
      const socket = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } });
      socket.readerId = null;

      handler.cancelForSocket(socket, READER_ID);

      expect(massIntroductionService.detachReader).toHaveBeenCalledWith(SESSION_ID, READER_ID);
    });

    it('keeps the session attached while another socket of the reader still shows it', () => {
      const leaving = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } }, 'a');
      const staying = makeSocket({ massIntroductionFlow: { sessionId: SESSION_ID, pendingCard: null } }, 'b');
      websocketService.sockets.set('a', leaving);
      websocketService.sockets.set('b', staying);

      handler.cancelForSocket(leaving);

      expect(massIntroductionService.detachReader).not.toHaveBeenCalled();
    });
  });
});
