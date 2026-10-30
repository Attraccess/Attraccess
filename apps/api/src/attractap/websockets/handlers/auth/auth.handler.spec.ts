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
    let mockEnrollment: { request: jest.Mock };

    beforeEach(() => {
      mockEnrollment = { request: jest.fn().mockReturnValue(true) };
      (handler as any).deviceEnrollment = mockEnrollment;
      (mockSocket as any).clientAddress = '10.0.0.5';
    });

    it('creates nothing and sends nothing for firmware without enrollment support', async () => {
      await handler.handleReaderRegister(mockSocket as any, { payload: {} } as AttractapEvent['data']);

      expect(mockEnrollment.request).not.toHaveBeenCalled();
      expect(mockAttractapService.createNewReader).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('queues an enrollment request without creating a reader', async () => {
      await handler.handleReaderRegister(
        mockSocket as any,
        {
          payload: { enrollment: { protocol: 1 } },
        } as AttractapEvent['data'],
      );

      expect(mockEnrollment.request).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'socket-1', address: '10.0.0.5' }),
      );
      expect(mockAttractapService.createNewReader).not.toHaveBeenCalled();
    });

    it('shows codes and rejections on the socket', async () => {
      await handler.handleReaderRegister(
        mockSocket as any,
        {
          payload: { enrollment: { protocol: 1 } },
        } as AttractapEvent['data'],
      );
      const connection = mockEnrollment.request.mock.calls[0][0];

      connection.sendCode('K7P-3XQ', 30000, 600000);
      connection.sendRejected('RATE_LIMITED', 5000);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_ENROLLMENT_CODE,
            payload: { code: 'K7P-3XQ', rotatesInMs: 30000, expiresInMs: 600000 },
          }),
        }),
      );
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_ENROLLMENT_REJECTED,
            payload: { reason: 'RATE_LIMITED', retryAfterMs: 5000 },
          }),
        }),
      );
    });

    it.each([
      ['missing', {}],
      ['true', { hasScreen: true }],
    ])('treats a reader with hasScreen %s as a screen reader without pattern', async (_label, extra) => {
      await handler.handleReaderRegister(
        mockSocket as any,
        { payload: { enrollment: { protocol: 1, ...extra } } } as AttractapEvent['data'],
      );
      const connection = mockEnrollment.request.mock.calls[0][0];
      expect(connection.hasScreen).toBe(true);

      connection.sendCode('K7P-3XQ', 30000, 600000, ['red', 'green', 'blue', 'yellow']);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: { code: 'K7P-3XQ', rotatesInMs: 30000, expiresInMs: 600000 },
          }),
        }),
      );
    });

    it('sends the pattern (or null) to readers without a screen and keeps their firmware', async () => {
      await handler.handleReaderRegister(
        mockSocket as any,
        {
          payload: {
            enrollment: { protocol: 1, hasScreen: false },
            firmware: { name: 'attractap_lite', variant: 'ethernet', version: '1.8.1\n', extra: 'x' },
          },
        } as AttractapEvent['data'],
      );
      const connection = mockEnrollment.request.mock.calls[0][0];
      expect(connection.hasScreen).toBe(false);
      expect(connection.firmware).toEqual({ name: 'attractap_lite', variant: 'ethernet', version: '1.8.1' });

      connection.sendCode('K7P-3XQ', 30000, 600000, ['red', 'green', 'blue', 'yellow']);
      connection.sendCode('K7P-3XR', 30000, 600000, null);

      const payloads = mockSocket.sendMessage.mock.calls.map(([event]) => event.data.payload);
      expect(payloads[0].pattern).toEqual(['red', 'green', 'blue', 'yellow']);
      expect(payloads[1].pattern).toBeNull();
    });

    it('creates the reader only when provisioned and delivers {id, token}', async () => {
      mockAttractapService.createNewReader.mockResolvedValue({ reader: { id: 99, name: 'Door' }, token: 'tok-abc' });
      mockAttractapService.deleteReader = jest.fn().mockResolvedValue(true);
      await handler.handleReaderRegister(
        mockSocket as any,
        {
          payload: { firmware: 'fw-1.2.3', enrollment: { protocol: 1 } },
        } as AttractapEvent['data'],
      );
      const connection = mockEnrollment.request.mock.calls[0][0];

      const device = await connection.provision({ name: 'Door' });
      expect(mockAttractapService.createNewReader).toHaveBeenCalledWith('fw-1.2.3', 'Door');
      expect(device).toMatchObject({ kind: 'reader', id: 99, name: 'Door' });

      await device.deliver();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_REGISTER,
            payload: { id: 99, token: 'tok-abc' },
          }),
        }),
      );

      await device.rollback();
      expect(mockAttractapService.deleteReader).toHaveBeenCalledWith(99);
    });
  });

  describe('handleAuthentication', () => {
    const data = { payload: { id: 42, token: 'client-token' } } as AttractapEvent['data'];

    it.each(['lookup', 'token', 'language'])('does not authenticate after closure during %s', async (stage) => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader', apiTokenHash: 'hash' });
      mockVerifyToken.mockResolvedValue(true);
      const pending =
        stage === 'lookup'
          ? mockAttractapService.findReaderById
          : stage === 'token'
            ? mockVerifyToken
            : (handler as any).settingsService.getDefaultLanguage;
      pending.mockImplementationOnce(async () => {
        mockSocket.readyState = WebSocket.CLOSED;
        return stage === 'lookup' ? { id: 42, name: 'Reader', apiTokenHash: 'hash' } : stage === 'token' ? true : 'de';
      });
      await handler.handleAuthentication(mockSocket as any, data);
      expect(mockSocket.readerId).toBeNull();
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      expect(mockResourceListService.sendResourceListToSocket).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapReaderConnected.set).not.toHaveBeenCalled();
    });

    it('delivers a default changed while the initial language read is pending', async () => {
      mockAttractapService.findReaderById.mockResolvedValue({ id: 42, name: 'Reader', apiTokenHash: 'hash' });
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
