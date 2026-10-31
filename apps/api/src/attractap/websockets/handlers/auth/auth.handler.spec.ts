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
  let mockAudit: { recordAttractap: jest.Mock };

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
    mockAudit = { recordAttractap: jest.fn().mockResolvedValue(undefined) };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).resourceListService = mockResourceListService;
    (handler as any).metricsService = mockMetricsService;
    (handler as any).audit = mockAudit;
    (handler as any).settingsService = { getDefaultLanguage: jest.fn().mockResolvedValue('de') };
    (handler as any).websocketService = new WebsocketService();
  });

  describe('handleReaderRegister', () => {
    it.each([{ payload: { firmware: { name: 'attractap' } } }, { payload: {} }])(
      'creates nothing and sends no reply: readers join through pairing',
      async (data) => {
        await expect(handler.handleReaderRegister(mockSocket as any, data as AttractapEvent['data'])).resolves.toBeUndefined();

        expect(mockAttractapService.createNewReader).not.toHaveBeenCalled();
        expect(mockAudit.recordAttractap).not.toHaveBeenCalled();
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
        expect(mockAudit.recordAttractap).toHaveBeenCalledTimes(1);
        expect(mockAudit.recordAttractap).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'reader.token_rejected',
            subjectId: 42,
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

    it('sets readerId, sends READER_AUTHENTICATED, and pushes the resource list on a valid token', async () => {
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
      expect(mockResourceListService.sendResourceListToSocket).toHaveBeenCalledWith(mockSocket);
    });

    it('sends READER_AUTHENTICATED before pushing the resource list', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader A',
        apiTokenHash: 'hashed',
        pairingState: 'unpaired',
      });
      mockVerifyToken.mockResolvedValue(true);

      const callOrder: string[] = [];
      mockSocket.sendMessage.mockImplementation(async () => {
        callOrder.push('sendMessage');
      });
      mockResourceListService.sendResourceListToSocket.mockImplementation(async () => {
        callOrder.push('sendResourceList');
      });

      await handler.handleAuthentication(mockSocket as any, data);

      expect(callOrder).toEqual(['sendMessage', 'sendResourceList']);
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
