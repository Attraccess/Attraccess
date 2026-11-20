import { readerTimeZoneStub } from '../../reader-time-zone.test-fixture';
import { WebsocketService } from '../../websocket.service';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapAuthHandler } from './auth.handler';
import { AttractapEventType } from '../../websocket.types';
import { WebSocket } from 'ws';

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
  let mockAttractapService: { findReaderById: jest.Mock };
  let mockResourceListService: { sendResourceListToSocket: jest.Mock };
  let mockMetricsService: { attractapReaderConnected: { set: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();

    handler = new AttractapAuthHandler();
    mockSocket = {
      id: 'socket-1',
      readerId: null,
      readerName: null,
      readyState: WebSocket.OPEN,
      state: {},
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };
    mockAttractapService = { findReaderById: jest.fn() };
    mockResourceListService = { sendResourceListToSocket: jest.fn().mockResolvedValue(undefined) };
    mockMetricsService = { attractapReaderConnected: { set: jest.fn() } };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).resourceListService = mockResourceListService;
    (handler as any).metricsService = mockMetricsService;
    (handler as any).readerTimeZone = readerTimeZoneStub();
    (handler as any).settingsService = { getDefaultLanguage: jest.fn().mockResolvedValue('de') };
    (handler as any).websocketService = new WebsocketService();
  });

  describe('authenticateSessionReader', () => {
    it('signs a paired reader in by its certificate and pushes the resource list', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader A', pairingState: 'paired' });

      await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(true);

      expect(mockSocket.readerId).toBe(42);
      expect(mockSocket.readerName).toBe('Reader A');
      expect(mockMetricsService.attractapReaderConnected.set).toHaveBeenCalledWith(
        { reader_id: '42', reader_name: 'Reader A' },
        1,
      );
      expect(mockResourceListService.sendResourceListToSocket).toHaveBeenCalledWith(mockSocket);
    });

    it('does not sign a reader in by certificate that is no longer paired', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader A', pairingState: 'revoked' });

      await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(false);

      expect(mockSocket.readerId).toBeNull();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
    });

    it('does not sign in a reader that no longer exists', async () => {
      mockAttractapService.findReaderById.mockResolvedValue(undefined);

      await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(false);

      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
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
      });

      const authenticated = () =>
        mockSocket.sendMessage.mock.calls
          .map(([message]) => message.data)
          .filter((event) => event.type === AttractapEventType.READER_AUTHENTICATED);

      it('sends the offset of the reader zone, resolved with the reader resources', async () => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          pairingState: 'paired',
          resources: [{ id: 5 }],
        });

        await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(true);

        // The generation is read before the lookup, so a reader update after it wins over the lookup's ids.
        expect(zones.resourceGeneration.mock.invocationCallOrder[0]).toBeLessThan(
          mockAttractapService.findReaderById.mock.invocationCallOrder[0],
        );
        expect(zones.resolve).toHaveBeenCalledWith(42, [5], 3);
        expect(zones.serverTimeFor).toHaveBeenCalledWith(42);
        expect(authenticated()).toEqual([
          expect.objectContaining({ payload: expect.objectContaining({ serverTime }) }),
        ]);
        // The sign-in lookup is the only one.
        expect(mockAttractapService.findReaderById).toHaveBeenCalledTimes(1);
        expect(mockSocket.state.signingIn).toBeUndefined();
      });

      it('counts as signing in as the reader while the zone resolves', async () => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          pairingState: 'paired',
          resources: [],
        });
        let during: unknown;
        zones.resolve.mockImplementationOnce(async () => {
          during = mockSocket.state.signingIn;
          return null;
        });

        await handler.authenticateSessionReader(mockSocket as any, 42);

        expect(during).toEqual({ readerId: 42, attempt: expect.any(Symbol) });
        expect(mockSocket.state.signingIn).toBeUndefined();
        expect(mockSocket.readerId).toBe(42);
      });

      it('does not sign in when the socket closes while the zone resolves, and lets go of the reader', async () => {
        mockAttractapService.findReaderById.mockResolvedValue({
          id: 42,
          name: 'Reader A',
          pairingState: 'paired',
          resources: [],
        });
        zones.resolve.mockImplementationOnce(async () => {
          mockSocket.readyState = WebSocket.CLOSED;
          return 'Asia/Tokyo';
        });

        await expect(handler.authenticateSessionReader(mockSocket as any, 42)).resolves.toBe(false);

        expect(mockSocket.readerId).toBeNull();
        expect(mockSocket.state.signingIn).toBeUndefined();
        expect(zones.forgetUnlessInUse).toHaveBeenCalledWith(42);
        expect(zones.serverTimeFor).not.toHaveBeenCalled();
        expect(mockSocket.sendMessage).not.toHaveBeenCalled();
        expect(mockMetricsService.attractapReaderConnected.set).not.toHaveBeenCalled();
        expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
      });

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
  });
});
