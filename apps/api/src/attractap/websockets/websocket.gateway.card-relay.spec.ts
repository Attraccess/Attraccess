/* eslint-disable @typescript-eslint/no-explicit-any -- partial socket and service mocks */
import { Logger } from '@nestjs/common';
import { crc32 } from 'zlib';
import { WebSocket } from 'ws';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { createReaderSenders, READER_SEND_LIMITS } from './reader-socket-send';
import { SESSION_SUBPROTOCOL } from '../security/session-framing';
import { CARD_CONVERSATION_LIMITS } from './card-conversation.service';
import { CardSessionService } from './handlers/ui/card-session.service';
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
      formsPresented: { '1:START': [7] },
    });
    fixture.websocketService.sockets.set(socket.id, socket);
    return socket;
  }

  const cardSessions = () => fixture.gateway['uiHandler']['cardSessions'] as CardSessionService;
  /** A card conversation waiting for the card's answer. */
  const pendingConversation = (socket: AuthenticatedWebSocket) =>
    fixture.gateway['cardConversations'].run(socket, 'tap', { uid: '04aabbccddee80', detectionId: 1 }, (channel) =>
      channel.exchange(Buffer.from([0x90, 0x60, 0, 0, 0])),
    );

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
      expect(socket.state.formsPresented).toBeUndefined();
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

    it.each(['READER_AUTHENTICATE', 'READER_REGISTER'])(
      'closes the connection on the removed token sign-in (%s) and logs nothing of it',
      async (type) => {
        const socket = loggedInReader();
        const warned = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

        await fixture.gateway.onClientEvent({ type, payload: { id: 7, token: 'tok-secret-value' } } as any, socket);

        expect(socket.terminate).toHaveBeenCalledTimes(1);
        expect(warned).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(warned.mock.calls)).toContain('token sign-in no longer supported');
        expect(JSON.stringify(warned.mock.calls)).not.toContain('tok-secret-value');
        expect(replies(socket)).toEqual([]);
      },
    );

    it('READER_SESSION_ENDED ends the card session', async () => {
      const socket = loggedInReader();
      cardSessions().issue(socket, 5, 'en');

      await send(socket, AttractapEventType.READER_SESSION_ENDED);

      expect(socket.state.cardSession).toBeNull();
    });

    it('CARD_SESSION_ENDED for the verified user ends the login like READER_SESSION_ENDED', async () => {
      const socket = loggedInReader({ sendRaw: jest.fn(() => true) });
      socket.state.supervisionFlow.webInitiated = false;
      const session = cardSessions().issue(socket, 5, 'en');
      const conversation = pendingConversation(socket);
      await new Promise(setImmediate);

      await send(socket, AttractapEventType.CARD_SESSION_ENDED, { cardSessionId: session.id });

      expect(await conversation).toEqual({ ok: false, reason: 'READER_SESSION_ENDED' });
      expect(socket.state.cardSession).toBeNull();
      expect(socket.state.verifiedUserId).toBeNull();
      expect(socket.state.verifiedCardUid).toBeNull();
      expect(socket.state.formDrafts).toBeUndefined();
      expect(supervisionService.cancelReaderRequest).toHaveBeenCalledWith('web-request');
    });

    it('CARD_SESSION_ENDED for an older card session keeps the current login', async () => {
      const socket = loggedInReader();
      const old = cardSessions().issue(socket, 4, 'en');
      cardSessions().issue(socket, 5, 'en');

      await send(socket, AttractapEventType.CARD_SESSION_ENDED, { cardSessionId: old.id });

      expect(abort).not.toHaveBeenCalled();
      expect(socket.state.verifiedUserId).toBe(5);
      expect(socket.state.formDrafts).toEqual({ '1:START': { 1: 'x' } });
      expect(socket.state.formsPresented).toEqual({ '1:START': [7] });
    });

    it('a credential change ends the login and armed flows before the socket is gone', async () => {
      const socket = loggedInReader({ sendRaw: jest.fn(() => true) });
      const conversation = pendingConversation(socket);
      await new Promise(setImmediate);

      await fixture.gateway.disconnectReader(7);

      expect(socket.terminate).toHaveBeenCalled();
      expect(socket.close).not.toHaveBeenCalled();
      // The close event has not arrived yet: nothing of the old login may still be usable.
      expect(await conversation).toEqual({ ok: false, reason: 'READER_UNREACHABLE' });
      expectConnectionStateCleared(socket);
      expect(massIntroductionService.detachReader).toHaveBeenCalledWith('mass-1', 7);

      await fixture.gateway.handleDisconnect(socket);
      expect(massIntroductionService.detachReader).toHaveBeenCalledTimes(1);
      expect(supervisionService.cancelReaderRequest).toHaveBeenCalledTimes(1);
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

  describe('reader activity', () => {
    it('keeps the card relay events free of the lastConnection write; heartbeats keep it fresh', async () => {
      const socket = loggedInReader();
      const route = jest.spyOn(fixture.gateway['cardDetectedRouter'], 'route').mockResolvedValue(undefined);

      await send(socket, AttractapEventType.CARD_DETECTED, { uid: '04aabbccddee80', detectionId: 1 });
      await send(socket, AttractapEventType.CARD_APDU_RESPONSE, { conversationId: 'c', seq: 1, response: '9100' });
      await send(socket, AttractapEventType.CARD_REMOVED, { conversationId: 'c' });

      expect(route).toHaveBeenCalled();
      expect(fixture.attractapService.updateLastReaderConnection).not.toHaveBeenCalled();

      await fixture.gateway.onHeartbeat(socket);
      expect(fixture.attractapService.updateLastReaderConnection).toHaveBeenCalledWith(7);
    });

    it('handles a logout before a later tap even while the activity write is slow', async () => {
      const socket = loggedInReader();
      socket.state.verifiedUserId = 11;
      // A write that never finishes must not hold READER_SESSION_ENDED behind the next tap.
      fixture.attractapService.updateLastReaderConnection.mockReturnValue(new Promise(() => undefined));
      const order: string[] = [];
      jest.spyOn(fixture.gateway, 'onReaderSessionEnded').mockImplementation(async () => {
        order.push('logout');
      });
      jest.spyOn(fixture.gateway['cardDetectedRouter'], 'route').mockImplementation(async () => {
        order.push('tap');
      });

      void fixture.gateway.onClientEvent(new AttractapEvent(AttractapEventType.READER_SESSION_ENDED, {}).data, socket);
      void fixture.gateway.onClientEvent(
        new AttractapEvent(AttractapEventType.CARD_DETECTED, { uid: '04aabbccddee80', detectionId: 2 }).data,
        socket,
      );
      await new Promise(setImmediate);

      expect(order).toEqual(['logout', 'tap']);
    });
  });

  describe('coredump upload (ATT-1144)', () => {
    it('answers BEGIN and CHUNK without an ACK round trip, skips the activity write per chunk and drops the upload on disconnect', async () => {
      const dump = Buffer.alloc(6000, 3);
      const findCrashReportOfReader = jest.fn().mockResolvedValue({
        id: 3,
        attractapId: 7,
        coredumpStatus: 'awaiting',
        coredumpExpectedSize: dump.length,
        coredumpExpectedCrc32: crc32(dump),
      });
      Object.assign(fixture.attractapService, { findCrashReportOfReader });
      const socket = loggedInReader({ sendRaw: jest.fn().mockReturnValue(true) });
      const raw = (reader: AuthenticatedWebSocket) =>
        (reader.sendRaw as jest.Mock).mock.calls.map(([message]) => message.data);

      await send(socket, AttractapEventType.READER_COREDUMP_BEGIN, {
        reportId: 3,
        size: dump.length,
        crc32: crc32(dump),
      });
      expect(raw(socket)).toEqual([
        {
          type: AttractapEventType.READER_COREDUMP_BEGIN,
          payload: { reportId: 3, chunkSize: 4096, nextOffset: 0 },
        },
      ]);
      expect(findCrashReportOfReader).toHaveBeenCalledWith(3, 7);

      fixture.attractapService.updateLastReaderConnection.mockClear();
      await send(socket, AttractapEventType.READER_COREDUMP_CHUNK, {
        reportId: 3,
        offset: 0,
        data: dump.subarray(0, 4096).toString('base64'),
      });
      expect(raw(socket).at(-1)).toEqual({
        type: AttractapEventType.READER_COREDUMP_CHUNK,
        payload: { reportId: 3, nextOffset: 4096 },
      });
      expect(fixture.attractapService.updateLastReaderConnection).not.toHaveBeenCalled();
      expect(socket.sendMessage).not.toHaveBeenCalled();

      await fixture.gateway.handleDisconnect(socket);
      // The reader reconnects and continues where it was: the server no longer holds the partial upload.
      const reconnected = loggedInReader({ id: 'reader-2', sendRaw: jest.fn().mockReturnValue(true) });
      await send(reconnected, AttractapEventType.READER_COREDUMP_CHUNK, {
        reportId: 3,
        offset: 4096,
        data: dump.subarray(4096).toString('base64'),
      });
      expect(raw(reconnected)).toEqual([
        { type: AttractapEventType.READER_COREDUMP_CHUNK, payload: { reportId: 3, error: 'COREDUMP_NO_UPLOAD' } },
      ]);
    });
  });

  describe('send limits of a paired reader (session transport)', () => {
    /** A session socket as ReaderSessionService.attach leaves it: queued bytes live in the session. */
    function sessionSenders(options: { queued?: () => number; refuse?: boolean } = {}) {
      const client: any = {
        readyState: WebSocket.OPEN,
        bufferedAmount: 0,
        readerId: 7,
        state: { verifiedUserId: null },
        pendingSendBytes: options.queued ?? (() => 0),
        send: jest.fn((_data: unknown, callback?: (error?: Error) => void) =>
          callback?.(options.refuse ? new Error('session closed or send queue full') : undefined),
        ),
        terminate: jest.fn(),
      };
      const waitForAck = jest.fn(async () => {
        throw new Error('timeout');
      });
      const senders = createReaderSenders({
        client,
        id: 's1',
        logger: new Logger('test'),
        waitForAck,
        canReceiveReaderLanguage: () => true,
        readerLanguage: () => undefined,
      });
      Object.assign(client, senders);
      return { client, socket: client as AuthenticatedWebSocket, waitForAck };
    }
    const apdu = () => new AttractapEvent(AttractapEventType.CARD_APDU, { apdu: '9060000000' });

    it('reports a frame the session refused, so a card exchange ends with READER_UNREACHABLE', async () => {
      const { socket } = sessionSenders({ refuse: true });

      expect(socket.sendRaw(apdu())).toBe(false);
      expect(await pendingConversation(socket)).toEqual({ ok: false, reason: 'READER_UNREACHABLE' });
      await expect(socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_LIST, {}))).resolves.toBe(false);
    });

    it("cuts the reader off at the session's queue limit, not the WebSocket's", async () => {
      const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { client, socket } = sessionSenders({ queued: () => READER_SEND_LIMITS.maxQueuedBytes + 1 });

      expect(socket.sendRaw(apdu())).toBe(false);

      expect(client.send).not.toHaveBeenCalled();
      expect(client.terminate).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalled();
    });

    it('accepts a large message while the session queue is below its limit', () => {
      const { client, socket } = sessionSenders({ queued: () => READER_SEND_LIMITS.maxQueuedBytes });
      socket.sendBinaryData(Buffer.alloc(60 * 1024));
      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.terminate).not.toHaveBeenCalled();
    });

    it('does not resend an unACKed message while the session queue is backed up', async () => {
      let queued = 0;
      const { client, socket, waitForAck } = sessionSenders({ queued: () => queued });
      waitForAck.mockImplementation(async () => {
        queued = READER_SEND_LIMITS.retryMaxQueuedBytes + 1;
        throw new Error('timeout');
      });

      await expect(socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_LIST, {}))).resolves.toBe(false);

      expect(client.send).toHaveBeenCalledTimes(1);
      expect(waitForAck).toHaveBeenCalledTimes(READER_SEND_LIMITS.ackRetryCount);
    });

    it('refuses a new card conversation with BUSY while the session queue is backed up', () => {
      const { socket } = sessionSenders({ queued: () => CARD_CONVERSATION_LIMITS.maxBufferedBytes + 1 });
      expect(fixture.gateway['cardConversations'].isBusy(socket)).toBe(true);
    });
  });

  describe('bounded send queue', () => {
    function connect(bufferedAmount = 0) {
      const client: any = {
        protocol: SESSION_SUBPROTOCOL,
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

    async function settle(_socket: AuthenticatedWebSocket, connection: Promise<void>) {
      await connection;
    }

    it('drops a card APDU and cuts the reader off when its send queue is full', async () => {
      const { client, socket, connection } = connect();
      await new Promise((resolve) => setImmediate(resolve));
      await settle(socket, connection);
      const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      client.send.mockClear();
      client.bufferedAmount = READER_SEND_LIMITS.maxQueuedBytes + 1;

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
      client.bufferedAmount = READER_SEND_LIMITS.maxQueuedBytes + 1;

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
        client.bufferedAmount = READER_SEND_LIMITS.retryMaxQueuedBytes + 1;
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

      expect(client.send).toHaveBeenLastCalledWith(expect.any(Buffer), expect.any(Function));
      expect(client.terminate).not.toHaveBeenCalled();
    });
  });

  it('never logs a token or card bytes during a refused token sign-in and a card exchange', async () => {
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
    const rejected = loggedInReader({ id: 'reader-2' });
    await send(rejected, 'READER_AUTHENTICATE' as AttractapEventType, { id: 7, token });
    const socket = loggedInReader({ sendRaw: jest.fn(() => true) });

    // Card traffic both ways, including answers to a conversation that does not exist (logged as ignored).
    socket.sendRaw(new AttractapEvent(AttractapEventType.CARD_APDU, { conversationId: 'c', seq: 1, apdu: cardBytes }));
    await send(socket, AttractapEventType.CARD_APDU_RESPONSE, { conversationId: 'c', seq: 1, response: cardBytes });
    await send(socket, AttractapEventType.CARD_REMOVED, { conversationId: 'c' });
    await expect(send(socket, AttractapEventType.ENROLL_NEW_CARD, { key: cardBytes })).rejects.toThrow();
    await send(socket, AttractapEventType.READER_SESSION_ENDED);
    await fixture.gateway.handleDisconnect(socket);

    const text = JSON.stringify(logged);
    expect(logged.length).toBeGreaterThan(0);
    expect(text).toContain('token sign-in no longer supported');
    expect(text).not.toContain(token);
    expect(text).not.toContain(cardBytes);
    expect(text).not.toMatch(/[0-9a-f]{32}/i);
  });
});
