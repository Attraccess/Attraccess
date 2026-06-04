/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapFirmwareHandler } from './firmware.handler';
import { AttractapEventType, AttractapEvent } from '../websocket.types';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    statSync: jest.fn(),
    openSync: jest.fn(),
    readSync: jest.fn(),
  };
});

import { existsSync, statSync, openSync, readSync } from 'fs';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
const mockOpenSync = openSync as jest.MockedFunction<typeof openSync>;
const mockReadSync = readSync as jest.MockedFunction<typeof readSync>;

describe('AttractapFirmwareHandler', () => {
  let handler: AttractapFirmwareHandler;
  let mockAttractapService: { updateReaderFirmware: jest.Mock };
  let mockFirmwareService: { getFirmwareDefinition: jest.Mock };
  let mockMetricsService: { attractapFirmwareUpdatesTotal: { inc: jest.Mock } };
  let socket: any;

  function makeSocket(overrides: any = {}): any {
    return {
      id: 'sock-1',
      readerId: 42,
      state: { ota: null },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    handler = Object.create(AttractapFirmwareHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockAttractapService = { updateReaderFirmware: jest.fn().mockResolvedValue(undefined) };
    mockFirmwareService = { getFirmwareDefinition: jest.fn() };
    mockMetricsService = { attractapFirmwareUpdatesTotal: { inc: jest.fn() } };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).firmwareService = mockFirmwareService;
    (handler as any).metricsService = mockMetricsService;

    socket = makeSocket();
  });

  describe('handleFirmwareChunkRequest', () => {
    it('returns early and logs error when no OTA context set', async () => {
      socket.state.ota = null;
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('no OTA context set'),
      );
    });

    it('returns early when OTA path missing', async () => {
      socket.state.ota = { size: 2048 };
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalled();
    });

    it('returns early when OTA size missing', async () => {
      socket.state.ota = { path: '/tmp/fw.bin' };
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalled();
    });

    it('returns early when offset is not a number', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 'x', length: 100 } } as any;

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when length is not a number', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 0, length: 'y' } } as any;

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when offset < 0', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: -1, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when length <= 0', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 0, length: 0 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when offset >= total', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 2048, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('opens fd lazily via openSync when fd absent', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      mockOpenSync.mockReturnValue(7 as any);
      mockReadSync.mockReturnValue(100 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(mockOpenSync).toHaveBeenCalledWith('/tmp/fw.bin', 'r');
      expect(socket.state.ota.fd).toBe(7);
      expect(socket.sendBinaryData).toHaveBeenCalled();
    });

    it('returns early and logs error when openSync throws', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      mockOpenSync.mockImplementation(() => {
        throw new Error('open failed');
      });
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open firmware'),
      );
    });

    it('does not call openSync when fd already present', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      mockReadSync.mockReturnValue(100 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(mockOpenSync).not.toHaveBeenCalled();
      expect(mockReadSync).toHaveBeenCalledWith(9, expect.any(Buffer), 0, 100, 0);
      expect(socket.sendBinaryData).toHaveBeenCalled();
    });

    it('returns early and logs error when readSync throws', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      mockReadSync.mockImplementation(() => {
        throw new Error('read failed');
      });
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read firmware chunk'),
      );
    });

    it('sends binary subarray on successful read with bytesRead>0', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      mockReadSync.mockReturnValue(50 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).toHaveBeenCalledTimes(1);
      const sentBuf = socket.sendBinaryData.mock.calls[0][0] as Buffer;
      expect(Buffer.isBuffer(sentBuf)).toBe(true);
      expect(sentBuf.length).toBe(50);
    });

    it('caps the read length at maxChunk (4096) and remaining bytes', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 100000, fd: 9 };
      mockReadSync.mockReturnValue(4096 as any);
      const data = { payload: { offset: 0, length: 999999 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      // safeLen = min(999999, 4096, 100000-0) = 4096
      expect(mockReadSync).toHaveBeenCalledWith(9, expect.any(Buffer), 0, 4096, 0);
    });

    it('caps the read length at total-offset when near end', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      mockReadSync.mockReturnValue(48 as any);
      const data = { payload: { offset: 2000, length: 4096 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      // safeLen = min(4096, 4096, 2048-2000) = 48
      expect(mockReadSync).toHaveBeenCalledWith(9, expect.any(Buffer), 0, 48, 2000);
    });

    it('does not send binary data when bytesRead is 0', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      mockReadSync.mockReturnValue(0 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await handler.handleFirmwareChunkRequest(socket, data);

      expect(socket.sendBinaryData).not.toHaveBeenCalled();
      expect((handler as any).logger.log).not.toHaveBeenCalled();
    });

    it('logs progress once per 10% bucket (lastLoggedPct gate)', async () => {
      socket.state.ota = { path: '/tmp/fw.bin', size: 1000, fd: 9 };

      // First read reaches 10% bucket
      mockReadSync.mockReturnValue(100 as any);
      await handler.handleFirmwareChunkRequest(socket, {
        payload: { offset: 0, length: 100 },
      } as AttractapEvent['data']);

      expect(socket.state.ota.lastLoggedPct).toBe(10);
      expect((handler as any).logger.log).toHaveBeenCalledTimes(1);
      expect((handler as any).logger.log).toHaveBeenCalledWith(
        expect.stringContaining('10%'),
      );

      // Second read still within the 10% bucket -> no additional log
      mockReadSync.mockReturnValue(50 as any);
      await handler.handleFirmwareChunkRequest(socket, {
        payload: { offset: 100, length: 50 },
      } as AttractapEvent['data']);

      // (100+50)/1000 = 15% -> bucket 10, not greater than lastLogged 10
      expect((handler as any).logger.log).toHaveBeenCalledTimes(1);

      // Third read crosses into 20% bucket -> logs again
      mockReadSync.mockReturnValue(100 as any);
      await handler.handleFirmwareChunkRequest(socket, {
        payload: { offset: 100, length: 100 },
      } as AttractapEvent['data']);

      // (100+100)/1000 = 20% -> bucket 20 > 10
      expect(socket.state.ota.lastLoggedPct).toBe(20);
      expect((handler as any).logger.log).toHaveBeenCalledTimes(2);
    });

    it('uses "unknown" reader label in progress log when readerId is absent', async () => {
      socket.readerId = null;
      socket.state.ota = { path: '/tmp/fw.bin', size: 1000, fd: 9 };
      mockReadSync.mockReturnValue(100 as any);

      await handler.handleFirmwareChunkRequest(socket, {
        payload: { offset: 0, length: 100 },
      } as AttractapEvent['data']);

      expect((handler as any).logger.log).toHaveBeenCalledWith(
        expect.stringContaining('reader unknown'),
      );
    });
  });

  describe('handleFirmwareInfo', () => {
    const payload = { name: 'attractap', variant: 'touch', version: '1.0.0' };
    const data = { payload } as AttractapEvent['data'];

    it('always calls updateReaderFirmware with readerId and payload', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '1.0.0' });

      await handler.handleFirmwareInfo(socket, data);

      expect(mockAttractapService.updateReaderFirmware).toHaveBeenCalledWith(42, payload);
    });

    it('does not send OTA message when firmware is already latest', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '1.0.0' });

      await handler.handleFirmwareInfo(socket, data);

      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('warns and returns when firmware definition missing on second lookup', async () => {
      // isFirmwareLatest first call returns a differing version (forces not-latest),
      // then the handler body re-looks up and gets null.
      mockFirmwareService.getFirmwareDefinition
        .mockResolvedValueOnce({ version: '2.0.0' })
        .mockResolvedValueOnce(null);

      await handler.handleFirmwareInfo(socket, data);

      expect((handler as any).logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No firmware definition found'),
      );
      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('logs error when OTA binary file is missing (existsSync false)', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      mockExistsSync.mockReturnValue(false);

      await handler.handleFirmwareInfo(socket, data);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('OTA firmware binary not found'),
      );
      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('logs error when OTA firmware size < 1024', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 512 } as any);

      await handler.handleFirmwareInfo(socket, data);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('suspicious'),
      );
      expect(socket.sendMessage).not.toHaveBeenCalled();
      expect(mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('logs error when OTA firmware size is 0/falsy', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 0 } as any);

      await handler.handleFirmwareInfo(socket, data);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('suspicious'),
      );
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('sets OTA state, sends READER_FIRMWARE_UPDATE_REQUIRED, and increments metric on valid update', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 4096 } as any);

      await handler.handleFirmwareInfo(socket, data);

      expect(socket.state.ota).toEqual(
        expect.objectContaining({ path: expect.stringContaining('fw-ota.bin'), size: 4096 }),
      );
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED,
            payload: {
              available: {
                name: 'attractap',
                variant: 'touch',
                version: '2.0.0',
                totalSize: 4096,
              },
            },
          }),
        }),
      );
      expect(mockMetricsService.attractapFirmwareUpdatesTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('falls back to filename when filenameOTA is absent', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
      });
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 2048 } as any);

      await handler.handleFirmwareInfo(socket, data);

      expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('fw.bin'));
      expect(socket.sendMessage).toHaveBeenCalled();
    });

    it('logs error when an exception is thrown while preparing the update', async () => {
      mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockImplementation(() => {
        throw new Error('stat boom');
      });

      await handler.handleFirmwareInfo(socket, data);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to prepare firmware update notice'),
      );
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });
  });
});
