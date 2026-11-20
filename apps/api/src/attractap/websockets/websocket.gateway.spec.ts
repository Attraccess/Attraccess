import { Logger } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { LicenseModuleType } from '../../license/license.service';
import { PAIRING_SUBPROTOCOL, SESSION_SUBPROTOCOL } from '../security/session-framing';
import { makeStringLVGLReady, sanitizeForLVGL } from './websocket-lvgl';
import { registerAttractapGatewayFixture } from './websocket.gateway.attractap-gateway.test-fixture';
import { ReaderTimeZoneService } from './reader-time-zone.service';
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
    it('closes the connection when license verification fails', async () => {
      fixture.licenseService.verifyLicense.mockRejectedValue(new Error('License invalid'));
      const mockClient = { protocol: SESSION_SUBPROTOCOL, close: jest.fn(), send: jest.fn() } as unknown as WebSocket;

      await fixture.gateway.handleConnection(mockClient);

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('closes a connection without the session subprotocol: token sign-in is gone', async () => {
      const warned = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const mockClient = { close: jest.fn(), send: jest.fn(), on: jest.fn() } as unknown as WebSocket;

      await fixture.gateway.handleConnection(mockClient);

      expect(mockClient.close).toHaveBeenCalledTimes(1);
      expect(mockClient.send).not.toHaveBeenCalled();
      expect(fixture.websocketService.sockets.size).toBe(0);
      expect(warned).toHaveBeenCalledTimes(1);
      expect(String(warned.mock.calls[0][0])).toContain('token sign-in no longer supported');
    });

    it('gates pairing connections on the license check', async () => {
      fixture.licenseService.verifyLicense.mockRejectedValue(new Error('License invalid'));
      const client = { protocol: PAIRING_SUBPROTOCOL, close: jest.fn(), send: jest.fn() } as unknown as WebSocket;
      const request = {} as IncomingMessage;

      await fixture.gateway.handleConnection(client, request);

      expect(fixture.licenseService.verifyLicense).toHaveBeenCalledWith({ modules: [LicenseModuleType.ATTRACTAP] });
      const handleConnection = fixture.pairingService.handleConnection;
      expect(handleConnection).toHaveBeenCalledWith(client, request, expect.any(Promise));
      await expect(handleConnection.mock.calls[0][2]).rejects.toThrow('License invalid');
      expect(fixture.websocketService.sockets.size).toBe(0);
    });

    it('admits pairing connections with a valid license', async () => {
      const client = { protocol: PAIRING_SUBPROTOCOL, close: jest.fn(), send: jest.fn() } as unknown as WebSocket;

      await fixture.gateway.handleConnection(client, {} as IncomingMessage);

      const admitted = fixture.pairingService.handleConnection.mock.calls[0][2];
      await expect(admitted).resolves.toBeUndefined();
      expect(client.close).not.toHaveBeenCalled();
    });

    it('registers a session connection once its handshake accepted the certificate', async () => {
      const mockClient = {
        protocol: SESSION_SUBPROTOCOL,
        close: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
      } as unknown as WebSocket;

      await fixture.gateway.handleConnection(mockClient);

      expect(fixture.websocketService.sockets.size).toBe(1);
      const registeredSocket = Array.from(fixture.websocketService.sockets.values())[0];
      expect(registeredSocket.readerId).toBeNull();
      expect(registeredSocket.state.verifiedUserId).toBeNull();
      // Nothing asks the reader to authenticate: the certificate was the identity.
      expect(mockClient.send).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('cleans up a connection rejected before socket initialization', async () => {
      fixture.licenseService.verifyLicense.mockRejectedValue(new Error('License invalid'));
      const client = {
        protocol: SESSION_SUBPROTOCOL,
        close: jest.fn(),
        send: jest.fn(),
      } as unknown as AuthenticatedWebSocket;
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

    it('forgets the reader time zone once its last socket, or one signing in as it, is gone', async () => {
      const zones = new ReaderTimeZoneService(
        { providers: () => [] } as never,
        {} as never,
        {} as never,
        fixture.websocketService as never,
        { emit: jest.fn() } as never,
      );
      (fixture.gateway as unknown as { readerTimeZone: unknown }).readerTimeZone = zones;
      const forget = jest.spyOn(zones, 'forget');
      const first = fixture.createMockSocket({ id: 'tz-1', readerId: 42 });
      const second = fixture.createMockSocket({ id: 'tz-2', readerId: 42 });
      // A reconnect: this socket is still resolving the zone before it becomes reader 42.
      const signingIn = fixture.createMockSocket({ id: 'tz-3', readerId: null });
      signingIn.state.signingIn = { readerId: 42, attempt: Symbol('sign-in') };
      fixture.websocketService.sockets.set('tz-1', first);
      fixture.websocketService.sockets.set('tz-2', second);
      fixture.websocketService.sockets.set('tz-3', signingIn);

      await fixture.gateway.handleDisconnect(first);
      await fixture.gateway.handleDisconnect(second);
      expect(forget).not.toHaveBeenCalled();
      // The reconnect became reader 42; when it closes, nobody uses the reader any more.
      delete signingIn.state.signingIn;
      signingIn.readerId = 42;
      await fixture.gateway.handleDisconnect(signingIn);
      expect(forget).toHaveBeenCalledWith(42);
    });

    it('closes OTA file descriptor on disconnect if present', async () => {
      const socket = fixture.createMockSocket({
        id: 'disc-ota',
        state: {
          verifiedUserId: null,
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

    it('answers with the offset of the reader time zone', async () => {
      jest.useFakeTimers({ now: new Date('2026-07-15T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      try {
        const zones = new ReaderTimeZoneService(
          { providers: () => [{ plugin: 'p', provider: { getTimeZone: () => 'Asia/Tokyo' } }] } as never,
          {} as never,
          { findReaderById: async () => ({ id: 7, resources: [{ id: 1 }] }) } as never,
          { sockets: new Map() } as never,
          { emit: jest.fn() } as never,
        );
        await zones.resolve(7);
        (fixture.gateway as unknown as { readerTimeZone: unknown }).readerTimeZone = zones;
        const socket = fixture.createMockSocket({ id: 'hb-zone', readerId: 7 });

        await fixture.gateway.onHeartbeat(socket);

        const reply = JSON.parse((socket as unknown as { send: jest.Mock }).send.mock.calls[0][0]);
        expect(reply).toMatchObject({ event: 'HEARTBEAT', serverTime: { utcOffsetMinutes: 540 } });
      } finally {
        jest.useRealTimers();
      }
    });

    it('lets the reader time zone retry a resolve that timed out', async () => {
      const onHeartbeat = jest.spyOn(fixture.gateway['readerTimeZone'], 'onHeartbeat');
      const socket = fixture.createMockSocket({ id: 'hb-retry', readerId: 7 });

      await fixture.gateway.onHeartbeat(socket);

      expect(onHeartbeat).toHaveBeenCalledWith(7);
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

    it('releases plugin BLE work of older connections when a reader announces its firmware', async () => {
      const socket = fixture.createMockSocket({ readerId: 7 });
      const released = jest.spyOn(fixture.gateway['readerBleDriver'], 'readerConnected');
      jest.spyOn(fixture.gateway['firmwareHandler'], 'handleFirmwareInfo').mockResolvedValue(undefined);
      await fixture.gateway.onClientEvent(
        { type: AttractapEventType.READER_FIRMWARE_INFO, payload: { name: 'attractap', version: '2.5.0' } },
        socket,
      );
      expect(released).toHaveBeenCalledWith(socket);
    });

    it('sends the advertisement watch set once the firmware info stored the BLE capability', async () => {
      const socket = fixture.createMockSocket({ readerId: 7 });
      const order: string[] = [];
      jest.spyOn(fixture.gateway['firmwareHandler'], 'handleFirmwareInfo').mockImplementation(async () => {
        order.push('firmware-info');
      });
      jest
        .spyOn(fixture.gateway['readerBleDriver'], 'readerAnnounced')
        .mockImplementation((announced) => void order.push(announced === socket ? 'announced' : 'other'));
      await fixture.gateway.onClientEvent(
        { type: AttractapEventType.READER_FIRMWARE_INFO, payload: { name: 'attractap', version: '2.5.0' } },
        socket,
      );
      expect(order).toEqual(['firmware-info', 'announced']);
    });

    it('rejects server-only event types from clients', async () => {
      const socket = fixture.createMockSocket({ id: 'ev-1', readerId: 1 });

      const serverOnlyEvents = [
        AttractapEventType.RESOURCE_LIST,
        AttractapEventType.READER_AUTHENTICATED,
        AttractapEventType.CARD_AUTHENTICATION_DATA,
        AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
        // Plugin BLE requests travel only from the server to the reader.
        AttractapEventType.BLE_SCAN,
        AttractapEventType.BLE_SESSION_OPEN,
        AttractapEventType.BLE_READ,
        AttractapEventType.BLE_WRITE,
        AttractapEventType.BLE_SUBSCRIBE,
        AttractapEventType.BLE_UNSUBSCRIBE,
        AttractapEventType.BLE_CANCEL,
        AttractapEventType.BLE_SESSION_CLOSE,
        AttractapEventType.BLE_WATCH_SET,
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

    it('terminates all sockets of the given reader', async () => {
      const socket1 = fixture.createMockSocket({ id: 'dr-1', readerId: 5 });
      const socket2 = fixture.createMockSocket({ id: 'dr-2', readerId: 5 });
      const other = fixture.createMockSocket({ id: 'dr-3', readerId: 6 });
      for (const socket of [socket1, socket2, other]) fixture.websocketService.sockets.set(socket.id, socket);

      await fixture.gateway.disconnectReader(5);

      // A closing handshake would leave the socket registered for this reader for up to 30 s.
      expect(socket1.terminate).toHaveBeenCalled();
      expect(socket2.terminate).toHaveBeenCalled();
      expect(socket1.close).not.toHaveBeenCalled();
      expect(other.terminate).not.toHaveBeenCalled();
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
    },
  );
  it.each(
    [AttractapEventType.READER_LANGUAGE, AttractapEventType.READER_AUTHENTICATED].flatMap((type) =>
      ['revoked', 'closed', 'invalid-id', 'reauthenticated'].map((reason) => [type, reason]),
    ),
  )('cancels pending %s retries for a %s socket while retaining another connection', async (type, reason) => {
    const wait = jest
      .spyOn(fixture.gateway as unknown as { waitForClientResponse: () => Promise<void> }, 'waitForClientResponse')
      .mockResolvedValue(undefined);
    const client = fixture.createMockSocket({ readyState: WebSocket.OPEN });
    await fixture.gateway.handleConnection(client);
    client.readerId = 42;
    const other = fixture.createMockSocket({ id: 'other', readerId: 42, readyState: WebSocket.OPEN });
    fixture.websocketService.sockets.set(other.id, other);
    (client.send as jest.Mock).mockClear();
    wait.mockImplementationOnce(async () => {
      if (reason === 'revoked') {
        client.readerId = null;
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
