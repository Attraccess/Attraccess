import { WebSocket } from 'ws';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { AttractapEvent, AttractapEventType } from './websocket.types';

describe('AttractapGateway', () => {
  const fixture = registerAttractapGatewayFixture();

  it('should be defined', () => {
    expect(fixture.gateway).toBeDefined();
  });

  describe('LVGL output sanitization', () => {
    const sanitize = (value: string) =>
      (fixture.gateway as unknown as { makeStringLVGLReady: (input: string) => string }).makeStringLVGLReady(value);

    it('preserves printable Latin-1 characters', () => {
      expect(sanitize('ÄÖÜ äöü ß \u00A0°®')).toBe('ÄÖÜ äöü ß \u00A0°®');
    });

    it('uses readable fallbacks for unsupported characters', () => {
      expect(sanitize('“München” — Größe™')).toBe('"München" - GrößeTM');
      expect(sanitize('Cafe\u0301 ☃')).toBe('Cafe ?');
    });

    it('preserves layout controls', () => {
      expect(sanitize('First line\nSecond line\r\n\tIndented')).toBe('First line\nSecond line\r\n\tIndented');
    });

    it('preserves form protocol values while sanitizing display metadata', () => {
      const message = new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_FIELDS, {
        fields: [
          {
            name: '“Größe”',
            description: null,
            options: ['Size™'],
            value: 'Size™',
          },
          {
            name: 'Note',
            description: null,
            options: { placeholder: '“Use Size™” — optional' },
            value: null,
          },
        ],
      });
      const sanitized = (fixture.gateway as unknown as { sanitizeForLVGL: <T>(value: T) => T }).sanitizeForLVGL(
        message,
      );
      const field = sanitized.data.payload.fields[0];

      expect(field.name).toBe('"Größe"');
      expect(field.options).toEqual(['Size™']);
      expect(field.value).toBe('Size™');
      expect(sanitized.data.payload.fields[1].options).toEqual({ placeholder: '"Use SizeTM" - optional' });
    });
  });

  describe('handleConnection', () => {
    it('closes the connection when license verification fails', async () => {
      fixture.licenseService.verifyLicense.mockRejectedValue(new Error('License invalid'));
      const mockClient = { close: jest.fn(), send: jest.fn() } as unknown as WebSocket;

      await fixture.gateway.handleConnection(mockClient);

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('registers the socket and sends auth request on successful connection', async () => {
      const mockClient = {
        close: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
      } as unknown as WebSocket;

      // handleConnection blocks on waitForClientResponse (3 retries × 4s).
      // Don't await — just let it start, then verify the socket was registered
      // and that send() was called with the READER_REQUEST_AUTHENTICATION event.
      const connectionPromise = fixture.gateway.handleConnection(mockClient);

      // Give the event loop a tick so handleConnection reaches the send call
      await new Promise((resolve) => setImmediate(resolve));

      expect(fixture.websocketService.sockets.size).toBe(1);
      const registeredSocket = Array.from(fixture.websocketService.sockets.values())[0];
      expect(registeredSocket.readerId).toBeNull();
      expect(registeredSocket.state.lastAuthenticatedUserId).toBeNull();

      expect(mockClient.send).toHaveBeenCalled();
      const sendMock = mockClient.send as jest.Mock;
      const sentData = JSON.parse(sendMock.mock.calls[0][0]);
      expect(sentData.data.type).toBe('READER_REQUEST_AUTHENTICATION');

      // Clean up: advance all timers so the promise settles
      jest.useFakeTimers();
      jest.runAllTimers();
      jest.useRealTimers();

      // Wait for the promise to settle (connection will be closed due to no ACK)
      await connectionPromise;
    }, 30000);
  });

  describe('handleDisconnect', () => {
    it('removes the socket from websocketService', async () => {
      const socket = fixture.createMockSocket({ id: 'disc-1' });
      fixture.websocketService.sockets.set('disc-1', socket);
      (fixture.gateway as unknown as { connectedAt: WeakMap<object, bigint> }).connectedAt.set(
        socket as unknown as object,
        process.hrtime.bigint(),
      );

      expect(fixture.websocketService.sockets.size).toBe(1);
      await fixture.gateway.handleDisconnect(socket);
      expect(fixture.websocketService.sockets.size).toBe(0);
      expect(fixture.mockWsMetrics.connectionDuration.observe).toHaveBeenCalledWith(
        { gateway: 'attractap' },
        expect.any(Number),
      );
    });

    it('closes OTA file descriptor on disconnect if present', async () => {
      const socket = fixture.createMockSocket({
        id: 'disc-ota',
        state: {
          lastAuthenticatedUserId: null,
          enrollNewCardData: null,
          resetNfcCardData: null,
          ota: { path: '/tmp/test', size: 1024, fd: 999 },
        },
      });
      fixture.websocketService.sockets.set('disc-ota', socket);

      await fixture.gateway.handleDisconnect(socket);
      expect(fixture.websocketService.sockets.has('disc-ota')).toBe(false);
    });
  });

  describe('onHeartbeat', () => {
    it('updates last reader connection for authenticated sockets', async () => {
      const socket = fixture.createMockSocket({ id: 'hb-1', readerId: 5 });

      await fixture.gateway.onHeartbeat(socket);

      expect(fixture.attractapService.updateLastReaderConnection).toHaveBeenCalledWith(5);
    });

    it('does not update for sockets without a readerId', async () => {
      const socket = fixture.createMockSocket({ id: 'hb-2', readerId: null });

      await fixture.gateway.onHeartbeat(socket);

      expect(fixture.attractapService.updateLastReaderConnection).not.toHaveBeenCalled();
    });

    it('sends a heartbeat ack back so idle links stay live', async () => {
      const socket = fixture.createMockSocket({ id: 'hb-3', readerId: 7 });

      await fixture.gateway.onHeartbeat(socket);

      expect((socket as unknown as { send: jest.Mock }).send).toHaveBeenCalledWith(
        JSON.stringify({ event: 'HEARTBEAT' }),
      );
    });
  });

  describe('onClientEvent', () => {
    it('passes the resource refresh request identity to the list service', async () => {
      const socket = fixture.createMockSocket({ readerId: 42 });
      const refresh = jest
        .spyOn(fixture.gateway['resourceListService'], 'sendResourceListToSocket')
        .mockResolvedValue(undefined);
      await fixture.gateway.onClientEvent(
        { type: AttractapEventType.REQUEST_RESOURCE_LIST, payload: { requestId: 880 } },
        socket,
      );
      expect(refresh).toHaveBeenCalledWith(socket, { requestId: 880 });
    });

    it('rejects server-only event types from clients', async () => {
      const socket = fixture.createMockSocket({ id: 'ev-1', readerId: 1 });

      const serverOnlyEvents = [
        AttractapEventType.RESOURCE_LIST,
        AttractapEventType.READER_UNAUTHORIZED,
        AttractapEventType.READER_REQUEST_AUTHENTICATION,
        AttractapEventType.READER_AUTHENTICATED,
        AttractapEventType.CARD_AUTHENTICATION_DATA,
        AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
      ];

      for (const type of serverOnlyEvents) {
        const event = new AttractapEvent(type, {});
        await expect(fixture.gateway.onClientEvent(event.data, socket)).rejects.toThrow(
          'THIS IS A SERVER SIDE ONLY EVENT',
        );
      }
    });

    it('ignores events from unauthenticated clients (no readerId) except REGISTER/AUTHENTICATE', async () => {
      const socket = fixture.createMockSocket({ id: 'ev-2', readerId: null });

      const event = new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, {});
      const result = await fixture.gateway.onClientEvent(event.data, socket);

      expect(result).toBeUndefined();
    });
  });

  describe('sendResourceList', () => {
    it('does nothing when no sockets match the reader id', async () => {
      await expect(fixture.gateway.sendResourceList(999)).resolves.toBeUndefined();
    });
  });

  describe('disconnectReader', () => {
    it('does nothing when no sockets match the reader id', async () => {
      await expect(fixture.gateway.disconnectReader(999)).resolves.toBeUndefined();
    });

    it('closes all sockets for the given reader', async () => {
      const socket1 = fixture.createMockSocket({ id: 'dr-1', readerId: 5 });
      const socket2 = fixture.createMockSocket({ id: 'dr-2', readerId: 5 });
      fixture.websocketService.sockets.set('dr-1', socket1);
      fixture.websocketService.sockets.set('dr-2', socket2);

      await fixture.gateway.disconnectReader(5);

      expect(socket1.close).toHaveBeenCalled();
      expect(socket2.close).toHaveBeenCalled();
    });
  });
  it('sends language updates only to open authenticated readers', async () => {
    const authenticated = fixture.createMockSocket({ id: 'authenticated', readerId: 42, readyState: WebSocket.OPEN });
    const unauthenticated = fixture.createMockSocket({ id: 'unauthenticated', readyState: WebSocket.OPEN });
    const missingIdentity = fixture.createMockSocket({
      id: 'missing',
      readerId: undefined,
      readyState: WebSocket.OPEN,
    });
    const closed = fixture.createMockSocket({ id: 'closed', readerId: 43, readyState: WebSocket.CLOSED });
    for (const socket of [authenticated, unauthenticated, missingIdentity, closed])
      fixture.websocketService.sockets.set(socket.id, socket);
    await fixture.gateway.updateReaderLanguage('en');
    expect(fixture.websocketService.readerLanguage).toBe('en');
    expect(authenticated.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: { type: AttractapEventType.READER_LANGUAGE, payload: { language: 'en' } } }),
    );
    for (const socket of [unauthenticated, missingIdentity, closed]) expect(socket.sendMessage).not.toHaveBeenCalled();
    (authenticated.sendMessage as jest.Mock).mockClear();
    authenticated.readerId = null;
    await fixture.gateway.updateReaderLanguage('de');
    expect(fixture.websocketService.readerLanguage).toBe('de');
    expect(authenticated.sendMessage).not.toHaveBeenCalled();
  });

  it.each([AttractapEventType.READER_AUTHENTICATED, AttractapEventType.READER_LANGUAGE])(
    'retries %s with the latest persisted default',
    async (type) => {
      const client = fixture.createMockSocket();
      const wait = jest.spyOn(
        fixture.gateway as unknown as { waitForClientResponse: () => Promise<void> },
        'waitForClientResponse',
      );
      wait.mockResolvedValue(undefined);
      await fixture.gateway.handleConnection(client);
      const socket = Array.from(fixture.websocketService.sockets.values())[0];
      (client.send as jest.Mock).mockClear();
      wait.mockImplementationOnce(async () => {
        await fixture.gateway.updateReaderLanguage('en');
        throw new Error('Lost acknowledgement');
      });
      await socket.sendMessage(new AttractapEvent(type, { language: 'de', name: 'Reader' }));
      const sent = (client.send as jest.Mock).mock.calls.map(([body]) => JSON.parse(body).data.payload.language);
      expect(sent).toEqual(['de', 'en']);
    },
  );
});
