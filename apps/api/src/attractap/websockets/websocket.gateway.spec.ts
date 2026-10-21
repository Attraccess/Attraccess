import { protectedReaderConnection } from './reader-connection-transport';
import { READER_WORK_LIMIT } from './reader-delivery-awaiters';
import { ResourceListService } from './handlers/resource-list/resource-list.service';
import { makeStringLVGLReady, sanitizeForLVGL } from './reader-display';
import { WebSocket } from 'ws';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

describe('AttractapGateway', () => {
  const fixture = registerAttractapGatewayFixture();

  it('should be defined', () => {
    expect(fixture.gateway).toBeDefined();
  });

  describe('LVGL output sanitization', () => {
    const sanitize = (value: string) => makeStringLVGLReady(value);

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
      const sanitized = sanitizeForLVGL(message);
      const field = sanitized.data.payload.fields[0];

      expect(field.name).toBe('"Größe"');
      expect(field.options).toEqual(['Size™']);
      expect(field.value).toBe('Size™');
      expect(sanitized.data.payload.fields[1].options).toEqual({ placeholder: '"Use SizeTM" - optional' });
    });
  });

  describe('handleConnection', () => {
    it.each([undefined, 'en'] as const)('sends the current language to a protected reader (%s)', async (latest) => {
      fixture.websocketService.readerLanguage = latest;
      jest
        .spyOn(
          (fixture.gateway as unknown as { resourceListService: ResourceListService }).resourceListService,
          'sendResourceListToSocket',
        )
        .mockResolvedValue(undefined);
      fixture.attractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Protected reader', resources: [] });
      jest
        .spyOn(fixture.gateway as unknown as { waitForClientResponse: () => Promise<void> }, 'waitForClientResponse')
        .mockResolvedValue(undefined);
      const client = fixture.createSecuredSocket();
      await fixture.gateway.handleConnection(client);
      expect(JSON.parse((client.send as jest.Mock).mock.calls[0][0]).data).toEqual(
        expect.objectContaining({
          type: AttractapEventType.READER_AUTHENTICATED,
          payload: expect.objectContaining({ name: 'Protected reader', language: latest ?? 'de' }),
        }),
      );
    });

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
        readyState: WebSocket.OPEN,
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

  describe('reader work capacity', () => {
    it('bounds sends before transmission, accepts immediate ACKs and recovers capacity after ACK or send failure', async () => {
      const client = fixture.createMockSocket({ readyState: WebSocket.OPEN });
      const connected = fixture.gateway.handleConnection(client);
      await new Promise((resolve) => setImmediate(resolve));
      await fixture.gateway['resolveClientResponseAwaiters'](client, AttractapEventType.READER_REQUEST_AUTHENTICATION);
      await connected;
      const type = AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED;
      const deliver = () => client.sendMessage(new AttractapEvent(type, {}));
      (client.send as jest.Mock).mockClear();
      const pending = Array.from({ length: READER_WORK_LIMIT }, deliver);
      for (let i = 0; i < 32; i++) await expect(deliver()).resolves.toBe(false);
      expect(client.send).toHaveBeenCalledTimes(READER_WORK_LIMIT);
      await fixture.gateway['resolveClientResponseAwaiters'](client, type);
      await expect(Promise.all(pending)).resolves.toEqual(Array(READER_WORK_LIMIT).fill(true));
      (client.send as jest.Mock).mockImplementation(() => {
        void fixture.gateway['resolveClientResponseAwaiters'](client, type);
      });
      await expect(deliver()).resolves.toBe(true);
      (client.send as jest.Mock).mockImplementationOnce(() => {
        throw new Error('send failed');
      });
      await expect(deliver()).resolves.toBe(false);
      await expect(deliver()).resolves.toBe(true);
      await fixture.gateway.handleDisconnect(client);
    });

    it.each(['protected', 'legacy'])('accepts ACKs at full application capacity on a %s socket', async (kind) => {
      fixture.attractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader', resources: [] });
      jest.spyOn(fixture.gateway['resourceListService'], 'sendResourceListToSocket').mockResolvedValue(undefined);
      const client =
        kind === 'protected'
          ? fixture.createSecuredSocket({ readerId: 42 })
          : fixture.createMockSocket({ readerId: 42, readyState: WebSocket.OPEN });
      const connected = fixture.gateway.handleConnection(client);
      await new Promise((resolve) => setImmediate(resolve));
      const initial =
        kind === 'protected'
          ? AttractapEventType.READER_AUTHENTICATED
          : AttractapEventType.READER_REQUEST_AUTHENTICATION;
      await fixture.gateway.onClientEvent({ type: `ACK_${initial}` as AttractapEventType, payload: {} }, client);
      await connected;
      client.readerId = 42;
      const type = AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED;
      const results: boolean[] = [];
      const handler = jest.fn(async () => {
        results.push(await client.sendMessage(new AttractapEvent(type, {})));
      });
      fixture.gateway['eventHandlers'][AttractapEventType.READER_FIRMWARE_INFO] = handler;
      const pending = Array.from({ length: READER_WORK_LIMIT }, () =>
        fixture.gateway.onClientEvent({ type: AttractapEventType.READER_FIRMWARE_INFO, payload: {} }, client),
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(handler).toHaveBeenCalledTimes(READER_WORK_LIMIT);
      try {
        await fixture.gateway.onClientEvent({ type: `ACK_${type}` as AttractapEventType, payload: {} }, client);
        await Promise.all(pending);
        expect(client.close).not.toHaveBeenCalled();
        expect(results).toEqual(Array(READER_WORK_LIMIT).fill(true));
      } finally {
        await fixture.gateway.handleDisconnect(client);
        await Promise.all(pending);
      }
    });

    it.each(['unready', 'disconnected', 'secured-history', 'forbidden-legacy', 'unknown'])(
      'ignores %s ACKs',
      async (reason) => {
        const client =
          reason === 'unready'
            ? fixture.createSecuredSocket({ readerId: 42 })
            : fixture.createMockSocket({ readerId: 42, readyState: WebSocket.OPEN });
        if (reason === 'unready') {
          const connection = protectedReaderConnection(client);
          connection.identity.revokedAt = new Date();
        }
        if (reason === 'disconnected') await fixture.gateway.handleDisconnect(client);
        if (reason === 'secured-history')
          jest.spyOn(fixture.gateway['identities'], 'isLegacy').mockResolvedValue(false);
        const resolve = jest.spyOn(fixture.gateway['responses'], 'acknowledge');
        const type =
          reason === 'forbidden-legacy'
            ? AttractapEventType.RESOURCE_LIST
            : AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED;
        // A different event must not release a pending delivery either.
        if (reason === 'unknown') {
          let completed = false;
          const pending = fixture.gateway['waitForClientResponse'](client, type).then(() => {
            completed = true;
          });
          await fixture.gateway.onClientEvent({ type: 'ACK_UNKNOWN' as AttractapEventType, payload: {} }, client);
          expect(completed).toBe(false);
          await fixture.gateway.onClientEvent({ type: `ACK_${type}` as AttractapEventType, payload: {} }, client);
          await pending;
        } else {
          await fixture.gateway.onClientEvent({ type: `ACK_${type}` as AttractapEventType, payload: {} }, client);
          expect(resolve).not.toHaveBeenCalled();
        }
      },
    );

    it('isolates ACKs by socket even when socket IDs match', async () => {
      const type = AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED;
      const client = fixture.createMockSocket({ readerId: 42 });
      const other = fixture.createMockSocket({ id: client.id, readerId: 42 });
      let completed = false;
      const pending = fixture.gateway['waitForClientResponse'](client, type).then(() => {
        completed = true;
      });
      await fixture.gateway.onClientEvent({ type: `ACK_${type}` as AttractapEventType, payload: {} }, other);
      expect(completed).toBe(false);
      await fixture.gateway.onClientEvent({ type: `ACK_${type}` as AttractapEventType, payload: {} }, client);
      await pending;
      expect(completed).toBe(true);
    });

    it('bounds ACK validation independently before asynchronous legacy checks', async () => {
      let finish: () => void;
      const blocked = new Promise<boolean>((resolve) => {
        finish = () => resolve(true);
      });
      const validate = jest.spyOn(fixture.gateway['identities'], 'isLegacy').mockReturnValue(blocked);
      const client = fixture.createMockSocket({ readerId: 42 });
      const ack = () =>
        fixture.gateway.onClientEvent(
          { type: 'ACK_READER_FIRMWARE_UPDATE_REQUIRED' as AttractapEventType, payload: {} },
          client,
        );
      const pending = Array.from({ length: READER_WORK_LIMIT }, ack);
      try {
        expect(validate).toHaveBeenCalledTimes(READER_WORK_LIMIT);
        await ack();
        expect(client.close).toHaveBeenCalledTimes(1);
        expect(validate).toHaveBeenCalledTimes(READER_WORK_LIMIT);
      } finally {
        finish();
        await Promise.all(pending);
      }
    });

    it.each(['event', 'heartbeat'])('bounds %s work before async lookup and isolates other sockets', async (kind) => {
      let finish: () => void;
      const blocked = new Promise<void>((resolve) => {
        finish = resolve;
      });
      fixture.attractapService.updateLastReaderConnection.mockReturnValue(blocked);
      const client = fixture.createMockSocket({ readerId: 42, readyState: WebSocket.OPEN });
      const other = fixture.createMockSocket({ id: 'other', readerId: 43, readyState: WebSocket.OPEN });
      const handler = jest.fn().mockResolvedValue(undefined);
      fixture.gateway['eventHandlers'][AttractapEventType.READER_FIRMWARE_INFO] = handler;
      const request = (socket: AuthenticatedWebSocket) =>
        kind === 'heartbeat'
          ? fixture.gateway.onHeartbeat(socket)
          : fixture.gateway.onClientEvent({ type: AttractapEventType.READER_FIRMWARE_INFO, payload: {} }, socket);
      const pending = Array.from({ length: READER_WORK_LIMIT }, () => request(client));
      await new Promise((resolve) => setImmediate(resolve));
      expect(fixture.attractapService.updateLastReaderConnection).toHaveBeenCalledTimes(READER_WORK_LIMIT);
      try {
        await request(client);
        expect(client.close).toHaveBeenCalledTimes(1);
        await request(client);
        expect(fixture.attractapService.updateLastReaderConnection).toHaveBeenCalledTimes(READER_WORK_LIMIT);
        const otherWork = request(other);
        await new Promise((resolve) => setImmediate(resolve));
        expect(fixture.attractapService.updateLastReaderConnection).toHaveBeenCalledTimes(READER_WORK_LIMIT + 1);
        finish();
        await Promise.all([...pending, otherWork]);
        if (kind === 'event') expect(handler).toHaveBeenCalledTimes(1);
        await request(other);
        expect(other.close).not.toHaveBeenCalled();
      } finally {
        finish();
        await Promise.all(pending);
      }
    });
  });

  describe('handleDisconnect', () => {
    it('reports false when lifecycle teardown interrupts a message awaiting its ACK', async () => {
      const client = fixture.createMockSocket({ readyState: WebSocket.OPEN });
      const connected = fixture.gateway.handleConnection(client);
      await new Promise((resolve) => setImmediate(resolve));
      const socket = client as unknown as AuthenticatedWebSocket;
      await fixture.gateway['resolveClientResponseAwaiters'](socket, AttractapEventType.READER_REQUEST_AUTHENTICATION);
      await connected;
      const delivery = socket.sendMessage(new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {}));
      await socket.cancelReaderConnection();
      await expect(delivery).resolves.toBe(false);
      expect(client.send).toHaveBeenCalledTimes(2);
    });

    it('cancels pending delivery without retrying and leaves a newer socket alone', async () => {
      const client = fixture.createMockSocket({ readyState: WebSocket.OPEN });
      const pending = fixture.gateway.handleConnection(client);
      await new Promise((resolve) => setImmediate(resolve));
      const old = client as unknown as AuthenticatedWebSocket;
      const newer = fixture.createMockSocket({ id: old.id, readerId: 42, readyState: WebSocket.OPEN });
      fixture.websocketService.sockets.set(old.id, newer);
      const newerAck = fixture.gateway['waitForClientResponse'](newer, AttractapEventType.READER_AUTHENTICATED);
      await fixture.gateway.handleDisconnect(old);
      await pending;
      expect(client.send).toHaveBeenCalledTimes(1);
      expect(fixture.websocketService.sockets.get(old.id)).toBe(newer);
      await fixture.gateway['resolveClientResponseAwaiters'](newer, AttractapEventType.READER_AUTHENTICATED);
      await expect(newerAck).resolves.toBeUndefined();
      await expect(
        old.sendMessage(new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {})),
      ).resolves.toBe(false);
    });

    it('cleans up a connection rejected before socket initialization', async () => {
      fixture.licenseService.verifyLicense.mockRejectedValue(new Error('License invalid'));
      const client = { close: jest.fn(), send: jest.fn() } as unknown as AuthenticatedWebSocket;
      const connectedAt = (fixture.gateway as unknown as { connectedAt: WeakMap<object, bigint> }).connectedAt;

      await fixture.gateway.handleConnection(client);
      expect(client.close).toHaveBeenCalledTimes(1);
      expect(client.state).toBeUndefined();
      expect(connectedAt.has(client)).toBe(true);

      await expect(fixture.gateway.handleDisconnect(client)).resolves.toBeUndefined();

      expect(connectedAt.has(client)).toBe(false);
      expect(fixture.mockWsMetrics.connectionDuration.observe).toHaveBeenCalledWith(
        { gateway: 'attractap' },
        expect.any(Number),
      );
      expect(fixture.websocketService.sockets.size).toBe(0);
    });

    it('invalidates pending authentication before waiting for cleanup', async () => {
      const attempt = Symbol('pending-authentication');
      const socket = fixture.createMockSocket({ readerId: 42, readerName: 'Reader' });
      socket.state.readerAuthenticationAttempt = attempt;
      const release = await fixture.gateway['clientResponseAwaitersMutex'].acquire();

      const disconnect = fixture.gateway.handleDisconnect(socket);
      const identity = { readerId: socket.readerId, readerName: socket.readerName };
      const invalidated = socket.state.readerAuthenticationAttempt !== attempt;
      release();
      await disconnect;

      expect(identity).toEqual({ readerId: null, readerName: null });
      expect(invalidated).toBe(true);
    });

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

      const send = (socket as unknown as { send: jest.Mock }).send;
      expect(send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({ event: 'HEARTBEAT' });
    });

    it('includes the server clock for the reader wall clock', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-10T12:32:00Z') });
      try {
        const socket = fixture.createMockSocket({ id: 'hb-4', readerId: 7 });

        await fixture.gateway.onHeartbeat(socket);

        const reply = JSON.parse((socket as unknown as { send: jest.Mock }).send.mock.calls[0][0]);
        expect(reply.serverTime).toEqual({
          epochMs: Date.parse('2026-10-10T12:32:00Z'),
          // JSON represents a UTC offset of -0 as 0.
          utcOffsetMinutes: -new Date('2026-10-10T12:32:00Z').getTimezoneOffset() || 0,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns public clock metadata without authenticating the reader or granting resource access', async () => {
      const socket = fixture.createMockSocket({ id: 'hb-public', readerId: null });
      const stateBefore = { ...socket.state };
      const resources = jest.spyOn(fixture.gateway['resourceListService'], 'sendResourceListToSocket');

      await fixture.gateway.onHeartbeat(socket);

      const send = (socket as unknown as { send: jest.Mock }).send;
      const reply = JSON.parse(send.mock.calls[0][0]);
      expect(reply).toMatchObject({ event: 'HEARTBEAT', serverTime: { epochMs: expect.any(Number) } });
      expect(socket.readerId).toBeNull();
      expect(socket.state).toEqual(stateBefore);
      expect(fixture.attractapService.updateLastReaderConnection).not.toHaveBeenCalled();
      expect(resources).not.toHaveBeenCalled();
      await fixture.gateway.onClientEvent(
        new AttractapEvent(AttractapEventType.REQUEST_RESOURCE_LIST, {}).data,
        socket,
      );
      expect(resources).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('onClientEvent', () => {
    it('passes the resource refresh request identity to the list service', async () => {
      const socket = fixture.createSecuredSocket({ readerId: 42 });
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
      const socket = fixture.createSecuredSocket({ id: 'ev-1', readerId: 1 });

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

    it('denies a legacy resource refresh even with a cached reader id', async () => {
      const socket = fixture.createMockSocket({ readerId: 42 });
      const refresh = jest.spyOn(fixture.gateway['resourceListService'], 'sendResourceListToSocket');
      await fixture.gateway.onClientEvent({ type: AttractapEventType.REQUEST_RESOURCE_LIST, payload: {} }, socket);
      expect(refresh).not.toHaveBeenCalled();
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
    const authenticated = fixture.createSecuredSocket({
      id: 'authenticated',
      readerId: 42,
      readyState: WebSocket.OPEN,
    });
    const legacy = fixture.createMockSocket({ id: 'legacy', readerId: 44, readyState: WebSocket.OPEN });
    const unauthenticated = fixture.createMockSocket({ id: 'unauthenticated', readyState: WebSocket.OPEN });
    const missingIdentity = fixture.createMockSocket({
      id: 'missing',
      readerId: undefined,
      readyState: WebSocket.OPEN,
    });
    const closed = fixture.createMockSocket({ id: 'closed', readerId: 43, readyState: WebSocket.CLOSED });
    for (const socket of [authenticated, legacy, unauthenticated, missingIdentity, closed])
      fixture.websocketService.sockets.set(socket.id, socket);
    await fixture.gateway.updateReaderLanguage('en');
    expect(fixture.websocketService.readerLanguage).toBe('en');
    expect(authenticated.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: { type: AttractapEventType.READER_LANGUAGE, payload: { language: 'en' } } }),
    );
    for (const socket of [legacy, unauthenticated, missingIdentity, closed])
      expect(socket.sendMessage).not.toHaveBeenCalled();
    (authenticated.sendMessage as jest.Mock).mockClear();
    authenticated.readerId = null;
    await fixture.gateway.updateReaderLanguage('de');
    expect(fixture.websocketService.readerLanguage).toBe('de');
    expect(authenticated.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects standalone legacy language delivery without starting ACK retries', async () => {
    const client = fixture.createMockSocket({ readerId: 42, readyState: WebSocket.OPEN });
    const wait = jest
      .spyOn(fixture.gateway as unknown as { waitForClientResponse: () => Promise<void> }, 'waitForClientResponse')
      .mockResolvedValue(undefined);
    await fixture.gateway.handleConnection(client);
    client.readerId = 42;
    wait.mockClear();
    (client.send as jest.Mock).mockClear();
    await expect(
      client.sendMessage(new AttractapEvent(AttractapEventType.READER_LANGUAGE, { language: 'en' })),
    ).resolves.toBe(false);
    expect(client.send).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it.each([AttractapEventType.READER_AUTHENTICATED])('retries %s with the latest persisted default', async (type) => {
    const client = fixture.createMockSocket();
    const wait = jest.spyOn(
      fixture.gateway as unknown as { waitForClientResponse: () => Promise<void> },
      'waitForClientResponse',
    );
    wait.mockResolvedValue(undefined);
    await fixture.gateway.handleConnection(client);
    const socket = Array.from(fixture.websocketService.sockets.values())[0];
    socket.readerId = 42;
    Object.defineProperty(client, 'readyState', { value: WebSocket.OPEN });
    (client.send as jest.Mock).mockClear();
    wait.mockImplementationOnce(async () => {
      fixture.websocketService.readerLanguage = 'en';
      throw new Error('Lost acknowledgement');
    });
    await socket.sendMessage(new AttractapEvent(type, { language: 'de', name: 'Reader' }));
    const sent = (client.send as jest.Mock).mock.calls.map(([body]) => JSON.parse(body).data.payload.language);
    expect(sent).toEqual(['de', 'en']);
  });
  it.each(
    [AttractapEventType.READER_AUTHENTICATED].flatMap((type) =>
      ['revoked', 'closed', 'invalid-id', 'reauthenticated'].map((reason) => [type, reason]),
    ),
  )('cancels pending %s retries for a %s socket while retaining another connection', async (type, reason) => {
    const wait = jest
      .spyOn(fixture.gateway as unknown as { waitForClientResponse: () => Promise<void> }, 'waitForClientResponse')
      .mockResolvedValue(undefined);
    const client = fixture.createMockSocket({ readyState: WebSocket.OPEN });
    await fixture.gateway.handleConnection(client);
    client.readerId = 42;
    const other = fixture.createSecuredSocket({ id: 'other', readerId: 42, readyState: WebSocket.OPEN });
    fixture.websocketService.sockets.set(other.id, other);
    (client.send as jest.Mock).mockClear();
    wait.mockImplementationOnce(async () => {
      if (reason === 'revoked') {
        await fixture.gateway.onClientEvent(
          { type: AttractapEventType.READER_AUTHENTICATE, payload: { id: 42, token: 'revoked' } },
          client,
        );
      } else if (reason === 'closed') {
        Object.defineProperty(client, 'readyState', { value: WebSocket.CLOSED });
      } else if (reason === 'invalid-id') {
        client.readerId = Number.NaN;
      } else {
        client.state.readerAuthenticationAttempt = Symbol('new-authentication');
      }
      throw new Error('Lost acknowledgement');
    });
    await client.sendMessage(new AttractapEvent(type as AttractapEventType, { language: 'en', name: 'Reader' }));
    const languageSends = (client.send as jest.Mock).mock.calls
      .map(([body]) => JSON.parse(body))
      .filter((message) => message.data.type === type);
    expect(languageSends).toHaveLength(1);
    expect(other.sendMessage).not.toHaveBeenCalled();
    await fixture.gateway.updateReaderLanguage('de');
    expect(other.sendMessage).toHaveBeenCalledTimes(1);
  });
});
