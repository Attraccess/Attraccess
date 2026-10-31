/* eslint-disable @typescript-eslint/no-explicit-any -- partial socket and service mocks */
import { Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { createReaderSenders, READER_SEND_LIMITS } from './reader-socket-send';
import { securelyHashToken } from './websocket.utils';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

/** Gateway-level rules of the card relay (ATT-1145): what the server forgets, refuses and never queues. */
describe('AttractapGateway card relay rules', () => {
  const fixture = registerAttractapGatewayFixture();

  let supervisionService: Record<string, jest.Mock>;
  let massIntroductionService: Record<string, jest.Mock>;
  let abort: jest.SpyInstance;

  beforeEach(() => {
    // The fixture provides bare objects; give the teardown paths what they call.
    supervisionService = fixture.gateway['supervisionHandler']['supervisionService'] as any;
    supervisionService.cancelReaderRequest = jest.fn();
    massIntroductionService = fixture.gateway['massIntroductionHandler']['massIntroductionService'] as any;
    massIntroductionService.detachReader = jest.fn();
    abort = jest.spyOn(fixture.gateway['cardConversations'], 'abort');
  });

  afterEach(() => jest.restoreAllMocks());

  /** A reader connection with a verified user and every kind of armed flow. */
  function loggedInReader(overrides: Record<string, unknown> = {}): AuthenticatedWebSocket {
    const socket = fixture.createMockSocket({
      id: 'reader-1',
      readerId: 7,
      readerName: 'Lathe',
      readyState: WebSocket.OPEN,
      ...overrides,
    } as any);
    Object.assign(socket.state, {
      verifiedUserId: 5,
      verifiedCardUid: '04aabbccddee80',
      cardConversation: null,
      enrollment: { userId: 5, auditPrincipal: { userId: 1, authenticationMethod: 'session' } },
      resetNfcCardData: { cardId: 3, auditPrincipal: { userId: 1, authenticationMethod: 'session' } },
      supervisionFlow: {
        resourceId: 1,
        requesterUserId: 5,
        requestId: 'web-request',
        approvedSupervisorUserId: null,
        webInitiated: true,
      },
      massIntroductionFlow: { sessionId: 'mass-1' },
      formDrafts: { '1:START': { 1: 'x' } },
    });
    fixture.websocketService.sockets.set(socket.id, socket);
    return socket;
  }

  const send = (socket: AuthenticatedWebSocket, type: AttractapEventType, payload: unknown = {}) =>
    fixture.gateway.onClientEvent(new AttractapEvent(type, payload).data, socket);
  const replies = (socket: AuthenticatedWebSocket) =>
    (socket.sendMessage as jest.Mock).mock.calls.map(([message]) => message.data);

  describe('legacy (pre-2.0.0) card events', () => {
    it.each([
      [AttractapEventType.SUPERVISOR_CARD_AUTH_CONFIRMED, AttractapEventType.SUPERVISION_RESOLVED],
      [AttractapEventType.MASS_INTRODUCTION_CARD_AUTH_CONFIRMED, AttractapEventType.MASS_INTRODUCTION_RESULT],
      [AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA, AttractapEventType.CARD_AUTHENTICATION_DATA],
      [
        AttractapEventType.REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA,
        AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA,
      ],
      [
        AttractapEventType.REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA,
        AttractapEventType.MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA,
      ],
      [AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY],
    ])('%s gets FIRMWARE_UPDATE_REQUIRED and approves nothing', async (type, replyType) => {
      const socket = loggedInReader();
      socket.state.verifiedUserId = null;
      const flow = socket.state.supervisionFlow;

      // What an old reader sends after it checked a card itself: never trusted.
      await send(socket, type, {
        success: true,
        uid: '04aabbccddee80',
        cardUID: '04aabbccddee80',
        sessionId: 'mass-1',
      });

      expect(replies(socket)).toEqual([
        expect.objectContaining({
          type: replyType,
          payload: expect.objectContaining({ error: 'FIRMWARE_UPDATE_REQUIRED' }),
        }),
      ]);
      expect(replies(socket)[0].payload.success).not.toBe(true);
      expect(flow.approvedSupervisorUserId).toBeNull();
      expect(socket.state.supervisionFlow).toBe(flow);
      expect(socket.state.verifiedUserId).toBeNull();
      // Nothing beyond the reply touched the supervision or mass-introduction services.
      expect(
        Object.keys(massIntroductionService).filter((name) => name !== 'setReaderPort' && name !== 'detachReader'),
      ).toEqual([]);
      expect(supervisionService.cancelReaderRequest).not.toHaveBeenCalled();
    });

    it.each([
      AttractapEventType.CARD_AUTHENTICATION_DATA,
      AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA,
      AttractapEventType.MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA,
      AttractapEventType.ENROLL_NEW_CARD,
      AttractapEventType.RESET_NFC_CARD,
    ])('%s from a reader is rejected and changes no state', async (type) => {
      const socket = loggedInReader();
      const before = { ...socket.state };

      await expect(send(socket, type, { success: true, key: '00'.repeat(16) })).rejects.toThrow(
        'THIS IS A SERVER SIDE ONLY EVENT',
      );

      expect(socket.state).toEqual(before);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('forgetting the verified user', () => {
    it('READER_SESSION_ENDED forgets the user and aborts the card conversation, but keeps admin-armed flows', async () => {
      const socket = loggedInReader();

      await send(socket, AttractapEventType.READER_SESSION_ENDED);

      expect(abort).toHaveBeenCalledWith(socket, 'READER_SESSION_ENDED');
      expect(socket.state.verifiedUserId).toBeNull();
      expect(socket.state.verifiedCardUid).toBeNull();
      expect(socket.state.formDrafts).toBeUndefined();
      // Web-started supervision, mass introduction, enrollment and reset do not belong to the login.
      expect(socket.state.supervisionFlow).not.toBeNull();
      expect(socket.state.massIntroductionFlow).not.toBeNull();
      expect(socket.state.enrollment).not.toBeNull();
      expect(socket.state.resetNfcCardData).not.toBeNull();
    });

    it('READER_SESSION_ENDED cancels a supervision the reader started for the logged-in user', async () => {
      const socket = loggedInReader();
      socket.state.supervisionFlow.webInitiated = false;

      await send(socket, AttractapEventType.READER_SESSION_ENDED);

      expect(socket.state.supervisionFlow).toBeNull();
      expect(supervisionService.cancelReaderRequest).toHaveBeenCalledWith('web-request');
    });

    it('a disconnect forgets the user, aborts the card conversation and tears down every armed flow', async () => {
      const socket = loggedInReader();

      await fixture.gateway.handleDisconnect(socket);

      expect(abort).toHaveBeenCalledWith(socket, 'READER_UNREACHABLE');
      expectConnectionStateCleared(socket);
      expect(massIntroductionService.detachReader).toHaveBeenCalledWith('mass-1', 7);
    });

    it('authenticating again on the same connection starts from nothing', async () => {
      const socket = loggedInReader();
      // Even a successful re-authentication as the same reader must not inherit the old login.
      const token = 'reader-token-for-reauth';
      const apiTokenHash = await securelyHashToken(token);
      let stateWhileCheckingCredentials: unknown;
      fixture.attractapService.findReaderById.mockImplementation(async () => {
        stateWhileCheckingCredentials = { ...socket.state };
        return { id: 7, name: 'Lathe', apiTokenHash, pairingState: 'unpaired', resources: [] };
      });
      jest.spyOn(fixture.gateway['resourceListService'], 'sendResourceListToSocket').mockResolvedValue(undefined);

      await send(socket, AttractapEventType.READER_AUTHENTICATE, { id: 7, token });

      // Cleared before the credentials are even checked.
      expect(stateWhileCheckingCredentials).toEqual(
        expect.objectContaining({ verifiedUserId: null, enrollment: null }),
      );

      expect(abort).toHaveBeenCalledWith(socket, 'READER_SESSION_ENDED');
      expect(massIntroductionService.detachReader).toHaveBeenCalledWith('mass-1', 7);
      expect(socket.readerId).toBe(7);
      expectConnectionStateCleared(socket);
    });

    function expectConnectionStateCleared(socket: AuthenticatedWebSocket) {
      expect(socket.state).toEqual(
        expect.objectContaining({
          verifiedUserId: null,
          verifiedCardUid: null,
          enrollment: null,
          resetNfcCardData: null,
          supervisionFlow: null,
          massIntroductionFlow: null,
          formDrafts: undefined,
        }),
      );
      expect(supervisionService.cancelReaderRequest).toHaveBeenCalledWith('web-request');
    }
  });

  describe('bounded send queue', () => {
    function connect(bufferedAmount = 0) {
      const client: any = {
        readyState: WebSocket.OPEN,
        bufferedAmount,
        send: jest.fn(),
        close: jest.fn(),
        terminate: jest.fn(),
        on: jest.fn(),
      };
      const connection = fixture.gateway.handleConnection(client);
      return { client, socket: client as AuthenticatedWebSocket, connection };
    }

    async function settle(socket: AuthenticatedWebSocket, connection: Promise<void>) {
      await fixture.gateway.onClientEvent({ type: 'ACK_READER_REQUEST_AUTHENTICATION' } as any, socket);
      await connection;
    }

    it('drops a card APDU and cuts the reader off when its send queue is full', async () => {
      const { client, socket, connection } = connect();
      await new Promise((resolve) => setImmediate(resolve));
      await settle(socket, connection);
      const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      client.send.mockClear();
      client.bufferedAmount = READER_SEND_LIMITS.maxBufferedBytes;

      const apdu = new AttractapEvent(AttractapEventType.CARD_APDU, { apdu: '90af000000' });
      expect(socket.sendRaw(apdu)).toBe(false);

      expect(client.send).not.toHaveBeenCalled();
      expect(client.terminate).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls.flat().join(' ')).not.toContain('90af000000');
    });

    it('drops an ACKed message instead of queueing it behind a full send queue', async () => {
      const { client, socket, connection } = connect();
      await new Promise((resolve) => setImmediate(resolve));
      await settle(socket, connection);
      client.send.mockClear();
      client.bufferedAmount = READER_SEND_LIMITS.maxBufferedBytes - 10;

      await expect(
        socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_LIST, { resources: [] })),
      ).resolves.toBe(false);

      expect(client.send).not.toHaveBeenCalled();
      expect(client.terminate).toHaveBeenCalledTimes(1);
    });

    it('does not queue another copy of an unACKed message while the queue is backed up', async () => {
      const client: any = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: jest.fn(), terminate: jest.fn() };
      client.state = {};
      const waitForAck = jest.fn(async () => {
        // The first copy is still queued: the reader is slow, not deaf.
        client.bufferedAmount = READER_SEND_LIMITS.retryMaxBufferedBytes + 1;
        throw new Error('timeout');
      });
      const { sendMessage } = createReaderSenders({
        client,
        id: 'c1',
        logger: new Logger('test'),
        waitForAck,
        canReceiveReaderLanguage: () => true,
        readerLanguage: () => undefined,
      });

      await expect(sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_LIST, {}))).resolves.toBe(false);

      expect(client.send).toHaveBeenCalledTimes(1);
      expect(waitForAck).toHaveBeenCalledTimes(READER_SEND_LIMITS.ackRetryCount);
      expect(client.terminate).not.toHaveBeenCalled();
    });

    it('does not drop OTA chunks of a reader that drains its queue', async () => {
      const { client, socket, connection } = connect();
      await new Promise((resolve) => setImmediate(resolve));
      await settle(socket, connection);
      client.bufferedAmount = 4096 * 3;

      socket.sendBinaryData(Buffer.alloc(4096));

      expect(client.send).toHaveBeenLastCalledWith(expect.any(Buffer));
      expect(client.terminate).not.toHaveBeenCalled();
    });
  });

  it('never logs the reader token or card bytes during authentication and a card exchange', async () => {
    const token = 'tok-' + 'c0ffee'.repeat(8);
    const cardBytes = '0123456789abcdef0123456789abcdef';
    const logged: unknown[] = [];
    for (const method of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => void logged.push(args));
      jest.spyOn(Logger, method).mockImplementation((...args: unknown[]) => void logged.push(args));
    }
    for (const method of ['log', 'error', 'warn', 'debug', 'info'] as const) {
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => void logged.push(args));
    }
    fixture.attractapService.findReaderById.mockResolvedValue({
      id: 7,
      name: 'Lathe',
      apiTokenHash: await securelyHashToken(token),
      pairingState: 'unpaired',
      resources: [],
    });
    jest.spyOn(fixture.gateway['resourceListService'], 'sendResourceListToSocket').mockResolvedValue(undefined);
    const client: any = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };
    const socket = client as AuthenticatedWebSocket;
    const connection = fixture.gateway.handleConnection(client);
    await new Promise((resolve) => setImmediate(resolve));
    await fixture.gateway.onClientEvent({ type: 'ACK_READER_REQUEST_AUTHENTICATION' } as any, socket);
    await connection;

    const authentication = send(socket, AttractapEventType.READER_AUTHENTICATE, { id: 7, token });
    for (
      let i = 0;
      i < 20 && !client.send.mock.calls.some(([m]: [string]) => m.includes('READER_AUTHENTICATED'));
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await fixture.gateway.onClientEvent({ type: 'ACK_READER_AUTHENTICATED' } as any, socket);
    await authentication;
    expect(socket.readerId).toBe(7);

    // Card traffic both ways, including answers to a conversation that does not exist (logged as ignored).
    socket.sendRaw(new AttractapEvent(AttractapEventType.CARD_APDU, { conversationId: 'c', seq: 1, apdu: cardBytes }));
    await send(socket, AttractapEventType.CARD_APDU_RESPONSE, { conversationId: 'c', seq: 1, response: cardBytes });
    await send(socket, AttractapEventType.CARD_REMOVED, { conversationId: 'c' });
    await expect(send(socket, AttractapEventType.ENROLL_NEW_CARD, { key: cardBytes })).rejects.toThrow();
    await send(socket, AttractapEventType.READER_SESSION_ENDED);
    await fixture.gateway.handleDisconnect(socket);

    const text = JSON.stringify(logged);
    expect(logged.length).toBeGreaterThan(0);
    expect(text).not.toContain(token);
    expect(text).not.toContain(cardBytes);
    expect(text).not.toMatch(/[0-9a-f]{32}/i);
  });
});
