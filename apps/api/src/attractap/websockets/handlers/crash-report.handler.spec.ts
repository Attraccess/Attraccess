/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapCrashReportHandler } from './crash-report.handler';
import { AttractapEvent, AttractapEventType } from '../websocket.types';

describe('AttractapCrashReportHandler', () => {
  let handler: AttractapCrashReportHandler;
  let mockSocket: {
    id: string;
    readerId: number;
    state: Record<string, unknown>;
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };
  let mockAttractapService: { createCrashReport: jest.Mock };
  let mockMetricsService: { attractapCrashReportsTotal: { inc: jest.Mock } };

  beforeEach(() => {
    handler = Object.create(AttractapCrashReportHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockSocket = {
      id: 'sock-1',
      readerId: 42,
      state: {},
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };

    mockAttractapService = {
      createCrashReport: jest.fn(),
    };

    mockMetricsService = {
      attractapCrashReportsTotal: { inc: jest.fn() },
    };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).metricsService = mockMetricsService;
  });

  describe('handleCrashReport - invalid payload guard', () => {
    it('rejects when payload is missing (undefined data.payload)', async () => {
      const data = {} as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapCrashReportsTotal.inc).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { error: 'INVALID_CRASH_REPORT' },
          }),
        }),
      );
      expect((handler as any).logger.error).toHaveBeenCalled();
    });

    it('rejects when resetReason is undefined', async () => {
      const data = { payload: { heapFreeBytes: 1234 } } as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapCrashReportsTotal.inc).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { error: 'INVALID_CRASH_REPORT' },
          }),
        }),
      );
    });

    it('rejects when resetReason is a non-string (number)', async () => {
      const data = { payload: { resetReason: 123 } } as unknown as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapCrashReportsTotal.inc).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { error: 'INVALID_CRASH_REPORT' },
          }),
        }),
      );
    });

    it('rejects when resetReason is an empty string (falsy)', async () => {
      const data = { payload: { resetReason: '' } } as unknown as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapCrashReportsTotal.inc).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { error: 'INVALID_CRASH_REPORT' },
          }),
        }),
      );
    });
  });

  describe('handleCrashReport - success', () => {
    it('stores the report, increments the metric, and acks with received + id', async () => {
      const payload = {
        resetReason: 'PANIC',
        heapFreeBytes: 1000,
        largestFreeBlockBytes: 500,
        uptimeBeforeResetMs: 5000,
        wsState: 'CONNECTED',
        wifiState: 'CONNECTED',
      };
      const report = { id: 'report-7', ...payload };
      mockAttractapService.createCrashReport.mockResolvedValue(report);

      const data = { payload } as unknown as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).toHaveBeenCalledWith(42, payload);
      expect(mockMetricsService.attractapCrashReportsTotal.inc).toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { received: true, id: 'report-7' },
          }),
        }),
      );
    });

    it('succeeds with minimal report (optional fields absent)', async () => {
      const payload = { resetReason: 'WDT' };
      const report = { id: 'report-min', resetReason: 'WDT' };
      mockAttractapService.createCrashReport.mockResolvedValue(report);

      const data = { payload } as unknown as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).toHaveBeenCalledWith(42, payload);
      expect(mockMetricsService.attractapCrashReportsTotal.inc).toHaveBeenCalledTimes(1);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { received: true, id: 'report-min' },
          }),
        }),
      );
    });
  });

  describe('handleCrashReport - store failure', () => {
    it('sends CRASH_REPORT_STORE_FAILED and logs the error when createCrashReport throws', async () => {
      mockAttractapService.createCrashReport.mockRejectedValue(new Error('DB down'));

      const data = { payload: { resetReason: 'PANIC' } } as unknown as AttractapEvent['data'];

      await handler.handleCrashReport(mockSocket as any, data);

      expect(mockAttractapService.createCrashReport).toHaveBeenCalledWith(42, { resetReason: 'PANIC' });
      expect(mockMetricsService.attractapCrashReportsTotal.inc).not.toHaveBeenCalled();
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_CRASH_REPORT,
            payload: { error: 'CRASH_REPORT_STORE_FAILED' },
          }),
        }),
      );
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('DB down'),
      );
    });
  });
});
