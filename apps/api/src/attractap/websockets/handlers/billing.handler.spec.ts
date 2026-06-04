/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapBillingHandler } from './billing.handler';
import { AttractapEventType, AttractapEvent } from '../websocket.types';

describe('AttractapBillingHandler', () => {
  let handler: AttractapBillingHandler;
  let mockSocket: {
    id: string;
    readerId: number;
    state: { lastAuthenticatedUserId: number | null };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };
  let mockSumUpService: {
    getIsEnabled: jest.Mock;
    getReaders: jest.Mock;
    topUpWithReader: jest.Mock;
  };

  const expectErrorResponse = (error: string, extra: Record<string, unknown> = {}) => {
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.BILLING_REQUEST_TOPUP,
          payload: { error, ...extra },
        }),
      }),
    );
  };

  beforeEach(() => {
    handler = Object.create(AttractapBillingHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockSumUpService = {
      getIsEnabled: jest.fn().mockResolvedValue(true),
      getReaders: jest.fn().mockResolvedValue([{ id: 'reader-1', status: 'paired' }]),
      topUpWithReader: jest.fn().mockResolvedValue(undefined),
    };

    (handler as any).sumUpService = mockSumUpService;

    mockSocket = {
      id: 'test-id',
      readerId: 42,
      state: { lastAuthenticatedUserId: 7 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };
  });

  const callHandler = (payload: unknown) =>
    (handler as any).handleBillingRequestTopup(mockSocket, { payload } as AttractapEvent['data']);

  describe('SumUp disabled', () => {
    it('sends SUMUP_NOT_ENABLED and does not proceed', async () => {
      mockSumUpService.getIsEnabled.mockResolvedValue(false);

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('SUMUP_NOT_ENABLED');
      expect((handler as any).logger.warn).toHaveBeenCalled();
      expect(mockSumUpService.getReaders).not.toHaveBeenCalled();
      expect(mockSumUpService.topUpWithReader).not.toHaveBeenCalled();
    });
  });

  describe('user not authenticated', () => {
    it('sends USER_NOT_AUTHENTICATED when lastAuthenticatedUserId is null', async () => {
      mockSocket.state.lastAuthenticatedUserId = null;

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('USER_NOT_AUTHENTICATED');
      expect((handler as any).logger.warn).toHaveBeenCalled();
      expect(mockSumUpService.getReaders).not.toHaveBeenCalled();
      expect(mockSumUpService.topUpWithReader).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_AUTHENTICATED when lastAuthenticatedUserId is 0 (falsy)', async () => {
      mockSocket.state.lastAuthenticatedUserId = 0;

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('USER_NOT_AUTHENTICATED');
    });
  });

  describe('invalid amount', () => {
    it('sends INVALID_AMOUNT for non-number (string)', async () => {
      await callHandler({ amountCents: '1000' });

      expectErrorResponse('INVALID_AMOUNT');
      expect(mockSumUpService.getReaders).not.toHaveBeenCalled();
    });

    it('sends INVALID_AMOUNT for non-number (undefined)', async () => {
      await callHandler({});

      expectErrorResponse('INVALID_AMOUNT');
    });

    it('sends INVALID_AMOUNT for non-integer (1.5)', async () => {
      await callHandler({ amountCents: 1.5 });

      expectErrorResponse('INVALID_AMOUNT');
    });

    it('sends INVALID_AMOUNT for zero', async () => {
      await callHandler({ amountCents: 0 });

      expectErrorResponse('INVALID_AMOUNT');
    });

    it('sends INVALID_AMOUNT for negative amount', async () => {
      await callHandler({ amountCents: -500 });

      expectErrorResponse('INVALID_AMOUNT');
    });

    it('sends INVALID_AMOUNT for NaN', async () => {
      await callHandler({ amountCents: NaN });

      expectErrorResponse('INVALID_AMOUNT');
    });

    it('logs a warning and does not call topUpWithReader on invalid amount', async () => {
      await callHandler({ amountCents: -1 });

      expect((handler as any).logger.warn).toHaveBeenCalled();
      expect(mockSumUpService.topUpWithReader).not.toHaveBeenCalled();
    });
  });

  describe('no readers available', () => {
    it('sends NO_SUMUP_TERMINALS_AVAILABLE when getReaders returns null', async () => {
      mockSumUpService.getReaders.mockResolvedValue(null);

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('NO_SUMUP_TERMINALS_AVAILABLE');
      expect(mockSumUpService.topUpWithReader).not.toHaveBeenCalled();
      expect((handler as any).logger.warn).toHaveBeenCalled();
    });

    it('sends NO_SUMUP_TERMINALS_AVAILABLE when getReaders returns empty array', async () => {
      mockSumUpService.getReaders.mockResolvedValue([]);

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('NO_SUMUP_TERMINALS_AVAILABLE');
      expect(mockSumUpService.topUpWithReader).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('prefers a paired reader and forwards userId, readerId, amountCents', async () => {
      mockSumUpService.getReaders.mockResolvedValue([
        { id: 'unpaired-1', status: 'pending' },
        { id: 'paired-1', status: 'paired' },
      ]);

      await callHandler({ amountCents: 2500 });

      expect(mockSumUpService.topUpWithReader).toHaveBeenCalledWith(7, 'paired-1', 2500);
      expect(mockSumUpService.topUpWithReader).toHaveBeenCalledTimes(1);
      expect((handler as any).logger.debug).toHaveBeenCalled();
      // No error message sent on success.
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('falls back to readers[0] when no paired reader exists', async () => {
      mockSumUpService.getReaders.mockResolvedValue([
        { id: 'first', status: 'pending' },
        { id: 'second', status: 'offline' },
      ]);

      await callHandler({ amountCents: 999 });

      expect(mockSumUpService.topUpWithReader).toHaveBeenCalledWith(7, 'first', 999);
    });

    it('uses readers[0] when it is the paired reader', async () => {
      mockSumUpService.getReaders.mockResolvedValue([{ id: 'only', status: 'paired' }]);

      await callHandler({ amountCents: 100 });

      expect(mockSumUpService.topUpWithReader).toHaveBeenCalledWith(7, 'only', 100);
    });
  });

  describe('topUpWithReader failure', () => {
    it('sends SUMUP_TOPUP_FAILED with error message details and logs error', async () => {
      mockSumUpService.topUpWithReader.mockRejectedValue(new Error('terminal offline'));

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('SUMUP_TOPUP_FAILED', { details: 'terminal offline' });
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('terminal offline'),
      );
    });

    it('catches errors thrown by getIsEnabled and sends SUMUP_TOPUP_FAILED', async () => {
      mockSumUpService.getIsEnabled.mockRejectedValue(new Error('config read failed'));

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('SUMUP_TOPUP_FAILED', { details: 'config read failed' });
      expect((handler as any).logger.error).toHaveBeenCalled();
    });

    it('catches errors thrown by getReaders and sends SUMUP_TOPUP_FAILED', async () => {
      mockSumUpService.getReaders.mockRejectedValue(new Error('readers fetch failed'));

      await callHandler({ amountCents: 1000 });

      expectErrorResponse('SUMUP_TOPUP_FAILED', { details: 'readers fetch failed' });
    });
  });
});
