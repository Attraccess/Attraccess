/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapAuthHandler } from './auth.handler';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { verifyToken } from '../websocket.utils';
import { AttractapGateway } from '../websocket.gateway';
import { WebsocketService } from '../websocket.service';

jest.mock('../websocket.utils', () => ({
  verifyToken: jest.fn(),
}));

const mockVerifyToken = verifyToken as jest.Mock;

describe('AttractapAuthHandler', () => {
  let handler: AttractapAuthHandler;
  let mockSocket: {
    id: string;
    readerId: number | null;
    readerName: string | null;
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

    handler = Object.create(AttractapAuthHandler.prototype);
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
    (handler as any).settingsService = { getAttractapLanguage: jest.fn().mockResolvedValue('de') };
    (handler as any).websocketService = new WebsocketService();
  });

  describe('handleReaderRegister', () => {
    it('creates a new reader with the firmware payload and sends READER_REGISTER response', async () => {
      const data = { payload: { firmware: 'fw-1.2.3' } } as AttractapEvent['data'];
      mockAttractapService.createNewReader.mockResolvedValue({
        reader: { id: 99 },
        token: 'tok-abc',
      });

      await handler.handleReaderRegister(mockSocket as any, data);

      expect(mockAttractapService.createNewReader).toHaveBeenCalledWith('fw-1.2.3');
      expect(mockAudit.recordAttractap).toHaveBeenCalledWith({
        action: 'reader.registered',
        actorId: null,
        authenticationMethod: null,
        subjectId: 99,
        details: { source: 'reader-websocket' },
      });
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_REGISTER,
            payload: { id: 99, token: 'tok-abc' },
          }),
        }),
      );
    });

    it('forwards the created reader id and token exactly', async () => {
      const data = { payload: { firmware: undefined } } as AttractapEvent['data'];
      mockAttractapService.createNewReader.mockResolvedValue({
        reader: { id: 7 },
        token: 'another-token',
      });

      await handler.handleReaderRegister(mockSocket as any, data);

      expect(mockAttractapService.createNewReader).toHaveBeenCalledWith(undefined);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_REGISTER,
            payload: { id: 7, token: 'another-token' },
          }),
        }),
      );
    });

    it('sends the registration response when audit persistence rejects', async () => {
      mockAttractapService.createNewReader.mockResolvedValue({ reader: { id: 7 }, token: 'another-token' });
      mockAudit.recordAttractap.mockRejectedValueOnce(new Error('audit unavailable'));

      await expect(
        handler.handleReaderRegister(mockSocket as any, { payload: {} } as AttractapEvent['data']),
      ).resolves.toBeUndefined();

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payload: { id: 7, token: 'another-token' } }) }),
      );
    });
  });

  describe('handleAuthentication', () => {
    const data = { payload: { id: 42, token: 'client-token' } } as AttractapEvent['data'];

    it('delivers a default changed while the initial language read is pending', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader', apiTokenHash: 'hash' });
      mockVerifyToken.mockResolvedValue(true);
      let finishRead!: (language: 'en' | 'de') => void;
      let readStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        readStarted = resolve;
      });
      (handler as any).settingsService.getAttractapLanguage.mockImplementation(() => {
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
            payload: { name: 'Reader', language: 'en' },
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
      finishLookup({ id: 42, name: 'Reader', apiTokenHash: 'hash' });
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

    it('sends READER_UNAUTHORIZED and does not set readerId when token is invalid', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({
        id: 42,
        name: 'Reader A',
        apiTokenHash: 'hashed',
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
            payload: { name: 'Reader A', language: 'de' },
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
