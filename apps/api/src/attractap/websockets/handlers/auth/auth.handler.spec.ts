import { readerTimeZoneStub } from '../../reader-time-zone.test-fixture';
import { AttractapGateway } from '../../websocket.gateway';
import { WebsocketService } from '../../websocket.service';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapAuthHandler } from './auth.handler';
import { AttractapEvent, AttractapEventType } from '../../websocket.types';
import { verifyToken } from '../../websocket.utils';
import { WebSocket } from 'ws';

jest.mock('../../websocket.utils', () => ({
  verifyToken: jest.fn(),
}));

const mockVerifyToken = verifyToken as jest.Mock;

describe('AttractapAuthHandler', () => {
  let handler: AttractapAuthHandler;
  let mockSocket: {
    id: string;
    readerId: number | null;
    readerName: string | null;
    readyState: number;
    state: Record<string, unknown>;
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };
  let mockAttractapService: { createNewReader: jest.Mock; findReaderById: jest.Mock };
  let mockResourceListService: { sendResourceListToSocket: jest.Mock };
  let mockMetricsService: { attractapReaderConnected: { set: jest.Mock } };
  let mockAudit: { record: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    handler = new AttractapAuthHandler();
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockSocket = {
      id: 'socket-1',
      readerId: null,
      readerName: null,
      readyState: WebSocket.OPEN,
      state: {},
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };

    mockAttractapService = {
      createNewReader: jest.fn(),
      findReaderById: jest.fn(),
    };

    mockResourceListService = {
      sendResourceListToSocket: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      attractapReaderConnected: { set: jest.fn() },
    };
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).resourceListService = mockResourceListService;
    (handler as any).metricsService = mockMetricsService;
    (handler as any).audit = mockAudit;
    (handler as any).readerTimeZone = readerTimeZoneStub();
    (handler as any).settingsService = { getDefaultLanguage: jest.fn().mockResolvedValue('de') };
    (handler as any).websocketService = new WebsocketService();
  });

  describe('handleReaderRegister', () => {
    it.each([{ payload: { firmware: { name: 'attractap' } } }, { payload: {} }])(
      'creates nothing and sends no reply: readers join through pairing',
      async (data) => {
        await expect(
          handler.handleReaderRegister(mockSocket as any, data as AttractapEvent['data']),
        ).resolves.toBeUndefined();

        expect(mockAttractapService.createNewReader).not.toHaveBeenCalled();
        expect(mockAudit.record).not.toHaveBeenCalled();
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      },
    );
  });

  describe('handleAuthentication', () => {
    const data = { payload: { id: 42, token: 'client-token' } } as AttractapEvent['data'];

    it.each(['lookup', 'token', 'language'])('does not authenticate after closure during %s', async (stage) => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader',
        apiTokenHash: 'hash',
        pairingState: 'unpaired',
      });
      mockVerifyToken.mockResolvedValue(true);
      const pending =
        stage === 'lookup'
          ? mockAttractapService.findReaderById
          : stage === 'token'
            ? mockVerifyToken
            : (handler as any).settingsService.getDefaultLanguage;
      pending.mockImplementationOnce(async () => {
        mockSocket.readyState = WebSocket.CLOSED;
        return stage === 'lookup'
          ? { id: 42, name: 'Reader', apiTokenHash: 'hash', pairingState: 'unpaired' }
          : stage === 'token'
            ? true
            : 'de';
      });
      await handler.handleAuthentication(mockSocket as any, data);
      expect(mockSocket.readerId).toBeNull();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapReaderConnected.set).not.toHaveBeenCalled();
    });

    it('delivers a default changed while the initial language read is pending', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader',
        apiTokenHash: 'hash',
        pairingState: 'unpaired',
      });
      mockVerifyToken.mockResolvedValue(true);
      let finishRead!: (language: 'en' | 'de') => void;
      let readStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        readStarted = resolve;
      });
      (handler as any).settingsService.getDefaultLanguage.mockImplementation(() => {
        readStarted();
        return new Promise((resolve) => {
          finishRead = resolve;
        });
      });
      const websocketService = (handler as any).websocketService;
      websocketService.sockets.set(mockSocket.id, mockSocket);
      const gateway = Object.create(AttractapGateway.prototype);
      gateway.websocketService = websocketService;
      const authentication = handler.handleAuthentication(mockSocket as any, data);
      await started;
      await gateway.updateReaderLanguage('en');
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      finishRead('de');
      await authentication;
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_AUTHENTICATED,
            payload: {
              name: 'Reader',
              language: 'en',
              serverTime: { epochMs: expect.any(Number), utcOffsetMinutes: expect.any(Number) },
            },
          }),
        }),
      );
    });

    it('revokes the previous reader identity when reauthentication fails', async () => {
      mockSocket.readerId = 99;
      mockSocket.readerName = 'Old reader';
      mockAttractapService.findReaderById.mockResolvedValueOnce(null);
      await handler.handleAuthentication(mockSocket as any, data);
      expect(mockSocket.readerId).toBeNull();
      expect(mockSocket.readerName).toBeNull();
      expect(mockMetricsService.attractapReaderConnected.set).toHaveBeenCalledWith(
        { reader_id: '99', reader_name: 'Old reader' },
        0,
      );
    });

    it('drops the previous reader zone state when reauthentication revokes the identity', async () => {
      const forgetUnlessInUse = jest.fn();
      (handler as any).readerTimeZone = { ...readerTimeZoneStub(), forgetUnlessInUse };
      mockSocket.readerId = 99;
      mockAttractapService.findReaderById.mockResolvedValueOnce(null);
      await handler.handleAuthentication(mockSocket as any, data);
      expect(forgetUnlessInUse).toHaveBeenCalledWith(99, mockSocket.id);
    });

    it('keeps another authenticated connection marked online when revoking the old identity', async () => {
      mockSocket.readerId = 99;
      (handler as any).websocketService.sockets.set('other', { id: 'other', readerId: 99 });
      mockAttractapService.findReaderById.mockResolvedValueOnce(null);
      await handler.handleAuthentication(mockSocket as any, data);
      expect(mockSocket.readerId).toBeNull();
      expect(mockMetricsService.attractapReaderConnected.set).not.toHaveBeenCalled();
    });

    it('does not restore an identity from an older authentication attempt after a newer rejection', async () => {
      let finishLookup = (_reader: unknown): void => {
        throw new Error('The earlier authentication lookup has not started');
      };
      mockAttractapService.findReaderById
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishLookup = resolve;
          }),
        )
        .mockResolvedValueOnce(null);
      const olderAttempt = handler.handleAuthentication(mockSocket as any, data);
      await handler.handleAuthentication(mockSocket as any, data);
      finishLookup({ id: 42, name: 'Reader', apiTokenHash: 'hash', pairingState: 'unpaired' });
      await olderAttempt;
      expect(mockSocket.readerId).toBeNull();
      expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockVerifyToken).not.toHaveBeenCalled();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
    });

    it('sends READER_UNAUTHORIZED and does not set readerId when reader is not found', async () => {
      mockAttractapService.findReaderById.mockResolvedValue(null);

      await handler.handleAuthentication(mockSocket as any, data);

      expect(mockAttractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_UNAUTHORIZED,
            payload: { message: 'PLEASE_REREGISTER' },
          }),
        }),
      );
      expect(mockSocket.readerId).toBeNull();
      expect(mockVerifyToken).not.toHaveBeenCalled();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
    });

    it.each(['paired', 'revoked'])(
      'rejects token sign-in for a %s reader without checking the token, and audits it once a minute',
      async (pairingState) => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          apiTokenHash: '',
          pairingState,
        });

        await handler.handleAuthentication(mockSocket as any, data);
        await handler.handleAuthentication(mockSocket as any, data);

        expect(mockVerifyToken).not.toHaveBeenCalled();
        expect(mockSocket.readerId).toBeNull();
        expect(mockSocket.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: AttractapEventType.READER_UNAUTHORIZED,
              payload: { message: 'PAIRING_REQUIRED' },
            }),
          }),
        );
        expect(mockAudit.record).toHaveBeenCalledTimes(1);
        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            domain: 'attractap',
            action: 'attractap.reader.token_rejected',
            subject: expect.objectContaining({ id: 42 }),
            details: { reason: pairingState },
          }),
        );
      },
    );

    it('sends READER_UNAUTHORIZED and does not set readerId when token is invalid', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader A',
        apiTokenHash: 'hashed',
        pairingState: 'unpaired',
      });
      mockVerifyToken.mockResolvedValue(false);

      await handler.handleAuthentication(mockSocket as any, data);

      expect(mockVerifyToken).toHaveBeenCalledWith('client-token', 'hashed');
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_UNAUTHORIZED,
            payload: { message: 'PLEASE_REREGISTER' },
          }),
        }),
      );
      expect(mockSocket.readerId).toBeNull();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
    });

    it('sets readerId and sends READER_AUTHENTICATED on a valid token, marking the reader as not paired', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader A',
        apiTokenHash: 'hashed',
        pairingState: 'unpaired',
      });
      mockVerifyToken.mockResolvedValue(true);

      await handler.handleAuthentication(mockSocket as any, data);

      expect(mockVerifyToken).toHaveBeenCalledWith('client-token', 'hashed');
      expect(mockSocket.readerId).toBe(42);
      expect(mockSocket.readerName).toBe('Reader A');
      expect(mockMetricsService.attractapReaderConnected.set).toHaveBeenCalledWith(
        { reader_id: '42', reader_name: 'Reader A' },
        1,
      );
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_AUTHENTICATED,
            payload: {
              name: 'Reader A',
              language: 'de',
              serverTime: { epochMs: expect.any(Number), utcOffsetMinutes: expect.any(Number) },
            },
          }),
        }),
      );
      // Signed in by token means not paired: no functions, and no resources to show.
      expect(mockSocket.state.pairingRequired).toBe(true);
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
    });

    it('signs a paired reader in by its certificate without the pairing gate and pushes the resource list', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader A', pairingState: 'paired' });
      mockSocket.state.pairingRequired = true;

      await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(true);

      expect(mockSocket.state.pairingRequired).toBe(false);
      expect(mockResourceListService.sendResourceListToSocket).toHaveBeenCalledWith(mockSocket);
    });

    it('does not sign a reader in by certificate that is no longer paired', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader A', pairingState: 'revoked' });

      await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(false);

      expect(mockSocket.readerId).toBeNull();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
    });

    describe('reader time zone', () => {
      const serverTime = { epochMs: Date.parse('2026-07-15T12:00:00Z'), utcOffsetMinutes: 540 };
      let zones: {
        resolve: jest.Mock;
        serverTimeFor: jest.Mock;
        resourceGeneration: jest.Mock;
        forgetUnlessInUse: jest.Mock;
      };

      beforeEach(() => {
        zones = {
          resolve: jest.fn().mockResolvedValue('Asia/Tokyo'),
          serverTimeFor: jest.fn(() => serverTime),
          resourceGeneration: jest.fn(() => 3),
          forgetUnlessInUse: jest.fn(),
        };
        (handler as any).readerTimeZone = { ...readerTimeZoneStub(), ...zones };
        mockVerifyToken.mockResolvedValue(true);
      });

      const authenticated = () =>
        mockSocket.sendMessage.mock.calls
          .map(([message]) => message.data)
          .filter((event) => event.type === AttractapEventType.READER_AUTHENTICATED);

      it('sends the offset of the reader zone on a token sign-in, resolved with the reader resources', async () => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          apiTokenHash: 'hashed',
          pairingState: 'unpaired',
          resources: [{ id: 3 }, { id: 1 }],
        });

        await handler.handleAuthentication(mockSocket as any, data);

        // The generation is read before the lookup, so a reader update after it wins over the lookup's ids.
        expect(zones.resourceGeneration.mock.invocationCallOrder[0]).toBeLessThan(
          mockAttractapService.findReaderById.mock.invocationCallOrder[0],
        );
        expect(zones.resolve).toHaveBeenCalledWith(42, [3, 1], 3);
        expect(zones.serverTimeFor).toHaveBeenCalledWith(42);
        expect(authenticated()).toEqual([
          expect.objectContaining({ payload: expect.objectContaining({ serverTime }) }),
        ]);
        // The sign-in lookup is the only one.
        expect(mockAttractapService.findReaderById).toHaveBeenCalledTimes(1);
        expect(mockSocket.state.signingIn).toBeUndefined();
      });

      it('sends the offset of the reader zone on a certificate sign-in, resolved with the reader resources', async () => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          pairingState: 'paired',
          resources: [{ id: 5 }],
        });

        await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(true);

        expect(zones.resolve).toHaveBeenCalledWith(42, [5], 3);
        expect(authenticated()).toEqual([
          expect.objectContaining({ payload: expect.objectContaining({ serverTime }) }),
        ]);
      });

      it.each(['token', 'certificate'])(
        'counts as signing in as the reader while the zone resolves (%s)',
        async (path) => {
          mockAttractapService.findReaderById.mockResolvedValue({
            id: 42,
            name: 'Reader A',
            apiTokenHash: 'hashed',
            pairingState: path === 'token' ? 'unpaired' : 'paired',
            resources: [],
          });
          let during: unknown;
          zones.resolve.mockImplementationOnce(async () => {
            during = mockSocket.state.signingIn;
            return null;
          });

          if (path === 'token') await handler.handleAuthentication(mockSocket as any, data);
          else await handler.authenticateSessionReader(mockSocket as any, 42);

          expect(during).toEqual({ readerId: 42, attempt: expect.any(Symbol) });
          expect(mockSocket.state.signingIn).toBeUndefined();
          expect(mockSocket.readerId).toBe(42);
        },
      );

      it.each(['token', 'certificate'])(
        'does not sign in by %s when the socket closes while the zone resolves, and lets go of the reader',
        async (path) => {
          mockAttractapService.findReaderById.mockResolvedValue({
            id: 42,
            name: 'Reader A',
            apiTokenHash: 'hashed',
            pairingState: path === 'token' ? 'unpaired' : 'paired',
            resources: [],
          });
          zones.resolve.mockImplementationOnce(async () => {
            mockSocket.readyState = WebSocket.CLOSED;
            return 'Asia/Tokyo';
          });

          if (path === 'token') await handler.handleAuthentication(mockSocket as any, data);
          else await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(false);

          expect(mockSocket.readerId).toBeNull();
          expect(mockSocket.state.signingIn).toBeUndefined();
          expect(zones.forgetUnlessInUse).toHaveBeenCalledWith(42);
          expect(zones.serverTimeFor).not.toHaveBeenCalled();
          expect(mockSocket.sendMessage).not.toHaveBeenCalled();
          expect(mockMetricsService.attractapReaderConnected.set).not.toHaveBeenCalled();
          expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
        },
      );

      it('lets a newer attempt win over one still resolving the zone', async () => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          pairingState: 'paired',
          resources: [],
        });
        let finishResolve: (value: string) => void = () => undefined;
        zones.resolve.mockImplementationOnce(() => new Promise((resolve) => (finishResolve = resolve)));
        const older = handler.authenticateSessionReader(mockSocket as any, 42);
        await new Promise((resolve) => setImmediate(resolve));
        mockAttractapService.findReaderById.mockResolvedValue(null);
        await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(false);
        finishResolve('Asia/Tokyo');

        await expect(older).resolves.toBe(false);
        expect(mockSocket.readerId).toBeNull();
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      });
    });

    it('does not send the unauthorized response on the happy path', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader A',
        apiTokenHash: 'hashed',
        pairingState: 'unpaired',
      });
      mockVerifyToken.mockResolvedValue(true);

      await handler.handleAuthentication(mockSocket as any, data);

      const unauthorizedCall = mockSocket.sendMessage.mock.calls.find(
        ([msg]) => msg.data.type === AttractapEventType.READER_UNAUTHORIZED,
      );
      expect(unauthorizedCall).toBeUndefined();
    });
  });
});
