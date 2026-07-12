/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapAuthHandler } from './auth.handler';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { verifyToken } from '../websocket.utils';

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

    (handler as any).attractapService = mockAttractapService;
    (handler as any).resourceListService = mockResourceListService;
    (handler as any).metricsService = mockMetricsService;
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
  });

  describe('handleAuthentication', () => {
    const data = { payload: { id: 42, token: 'client-token' } } as AttractapEvent['data'];

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
            payload: { name: 'Reader A' },
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
