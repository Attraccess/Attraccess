/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerAttractapFirmwareHandlerFixture } from './firmware.handler.attractap-firmware-handler.test-fixture';
import { AttractapEvent, AttractapEventType } from './../websocket.types';

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
describe('AttractapFirmwareHandler', () => {
  const fixture = registerAttractapFirmwareHandlerFixture();

  describe('handleFirmwareChunkRequest', () => {
    it('returns early and logs error when no OTA context set', async () => {
      fixture.socket.state.ota = null;
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(expect.stringContaining('no OTA context set'));
    });

    it('returns early when OTA path missing', async () => {
      fixture.socket.state.ota = { size: 2048 };
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalled();
    });

    it('returns early when OTA size missing', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin' };
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalled();
    });

    it('returns early when offset is not a number', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 'x', length: 100 } } as any;

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when length is not a number', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 0, length: 'y' } } as any;

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when offset < 0', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: -1, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when length <= 0', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 0, length: 0 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('returns early when offset >= total', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      const data = { payload: { offset: 2048, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid chunk request'),
      );
    });

    it('opens fd lazily via openSync when fd absent', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      fixture.mockOpenSync.mockReturnValue(7 as any);
      fixture.mockReadSync.mockReturnValue(100 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.mockOpenSync).toHaveBeenCalledWith('/tmp/fw.bin', 'r');
      expect(fixture.socket.state.ota.fd).toBe(7);
      expect(fixture.socket.sendBinaryData).toHaveBeenCalled();
    });

    it('returns early and logs error when openSync throws', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048 };
      fixture.mockOpenSync.mockImplementation(() => {
        throw new Error('open failed');
      });
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open firmware'),
      );
    });

    it('does not call openSync when fd already present', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      fixture.mockReadSync.mockReturnValue(100 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.mockOpenSync).not.toHaveBeenCalled();
      expect(fixture.mockReadSync).toHaveBeenCalledWith(9, expect.any(Buffer), 0, 100, 0);
      expect(fixture.socket.sendBinaryData).toHaveBeenCalled();
    });

    it('returns early and logs error when readSync throws', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      fixture.mockReadSync.mockImplementation(() => {
        throw new Error('read failed');
      });
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read firmware chunk'),
      );
    });

    it('sends binary subarray on successful read with bytesRead>0', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      fixture.mockReadSync.mockReturnValue(50 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).toHaveBeenCalledTimes(1);
      const sentBuf = fixture.socket.sendBinaryData.mock.calls[0][0] as Buffer;
      expect(Buffer.isBuffer(sentBuf)).toBe(true);
      expect(sentBuf.length).toBe(50);
    });

    it('caps the read length at maxChunk (4096) and remaining bytes', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 100000, fd: 9 };
      fixture.mockReadSync.mockReturnValue(4096 as any);
      const data = { payload: { offset: 0, length: 999999 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      // safeLen = min(999999, 4096, 100000-0) = 4096
      expect(fixture.mockReadSync).toHaveBeenCalledWith(9, expect.any(Buffer), 0, 4096, 0);
    });

    it('caps the read length at total-offset when near end', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      fixture.mockReadSync.mockReturnValue(48 as any);
      const data = { payload: { offset: 2000, length: 4096 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      // safeLen = min(4096, 4096, 2048-2000) = 48
      expect(fixture.mockReadSync).toHaveBeenCalledWith(9, expect.any(Buffer), 0, 48, 2000);
    });

    it('does not send binary data when bytesRead is 0', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 2048, fd: 9 };
      fixture.mockReadSync.mockReturnValue(0 as any);
      const data = { payload: { offset: 0, length: 100 } } as AttractapEvent['data'];

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, data);

      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
      expect((fixture.handler as any).logger.log).not.toHaveBeenCalled();
    });

    it('logs progress once per 10% bucket (lastLoggedPct gate)', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 1000, fd: 9 };

      // First read reaches 10% bucket
      fixture.mockReadSync.mockReturnValue(100 as any);
      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
        payload: { offset: 0, length: 100 },
      } as AttractapEvent['data']);

      expect(fixture.socket.state.ota.lastLoggedPct).toBe(10);
      expect((fixture.handler as any).logger.log).toHaveBeenCalledTimes(1);
      expect((fixture.handler as any).logger.log).toHaveBeenCalledWith(expect.stringContaining('10%'));

      // Second read still within the 10% bucket -> no additional log
      fixture.mockReadSync.mockReturnValue(50 as any);
      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
        payload: { offset: 100, length: 50 },
      } as AttractapEvent['data']);

      // (100+50)/1000 = 15% -> bucket 10, not greater than lastLogged 10
      expect((fixture.handler as any).logger.log).toHaveBeenCalledTimes(1);

      // Third read crosses into 20% bucket -> logs again
      fixture.mockReadSync.mockReturnValue(100 as any);
      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
        payload: { offset: 100, length: 100 },
      } as AttractapEvent['data']);

      // (100+100)/1000 = 20% -> bucket 20 > 10
      expect(fixture.socket.state.ota.lastLoggedPct).toBe(20);
      expect((fixture.handler as any).logger.log).toHaveBeenCalledTimes(2);
    });

    it('uses "unknown" reader label in progress log when readerId is absent', async () => {
      fixture.socket.readerId = null;
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 1000, fd: 9 };
      fixture.mockReadSync.mockReturnValue(100 as any);

      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
        payload: { offset: 0, length: 100 },
      } as AttractapEvent['data']);

      expect((fixture.handler as any).logger.log).toHaveBeenCalledWith(expect.stringContaining('reader unknown'));
    });
  });

  describe('handleFirmwareInfo', () => {
    const payload = { name: 'attractap', variant: 'touch', version: '1.0.0' };
    const data = { payload } as AttractapEvent['data'];

    it('always calls updateReaderFirmware with readerId and payload', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '1.0.0' });

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect(fixture.mockAttractapService.updateReaderFirmware).toHaveBeenCalledWith(42, payload);
    });

    it('does not send OTA message when firmware is already latest', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '1.0.0' });

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect(fixture.socket.sendMessage).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('warns and returns when firmware definition missing on second lookup', async () => {
      // isFirmwareLatest first call returns a differing version (forces not-latest),
      // then the handler body re-looks up and gets null.
      fixture.mockFirmwareService.getFirmwareDefinition
        .mockResolvedValueOnce({ version: '2.0.0' })
        .mockResolvedValueOnce(null);

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect((fixture.handler as any).logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No firmware definition found'),
      );
      expect(fixture.socket.sendMessage).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('logs error when OTA binary file is missing (existsSync false)', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      fixture.mockExistsSync.mockReturnValue(false);

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('OTA firmware binary not found'),
      );
      expect(fixture.socket.sendMessage).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('logs error when OTA firmware size < 1024', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      fixture.mockExistsSync.mockReturnValue(true);
      fixture.mockStatSync.mockReturnValue({ size: 512 } as any);

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(expect.stringContaining('suspicious'));
      expect(fixture.socket.sendMessage).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.attractapFirmwareUpdatesTotal.inc).not.toHaveBeenCalled();
    });

    it('logs error when OTA firmware size is 0/falsy', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      fixture.mockExistsSync.mockReturnValue(true);
      fixture.mockStatSync.mockReturnValue({ size: 0 } as any);

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(expect.stringContaining('suspicious'));
      expect(fixture.socket.sendMessage).not.toHaveBeenCalled();
    });

    it('sets OTA state, sends READER_FIRMWARE_UPDATE_REQUIRED, and increments metric on valid update', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      fixture.mockExistsSync.mockReturnValue(true);
      fixture.mockStatSync.mockReturnValue({ size: 4096 } as any);

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect(fixture.socket.state.ota).toEqual(
        expect.objectContaining({ path: expect.stringContaining('fw-ota.bin'), size: 4096 }),
      );
      expect(fixture.socket.sendMessage).toHaveBeenCalledWith(
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
      expect(fixture.mockMetricsService.attractapFirmwareUpdatesTotal.inc).toHaveBeenCalledTimes(1);
    });

    it('falls back to filename when filenameOTA is absent', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
      });
      fixture.mockExistsSync.mockReturnValue(true);
      fixture.mockStatSync.mockReturnValue({ size: 2048 } as any);

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect(fixture.mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('fw.bin'));
      expect(fixture.socket.sendMessage).toHaveBeenCalled();
    });

    it('logs error when an exception is thrown while preparing the update', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      fixture.mockExistsSync.mockReturnValue(true);
      fixture.mockStatSync.mockImplementation(() => {
        throw new Error('stat boom');
      });

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect((fixture.handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to prepare firmware update notice'),
      );
      expect(fixture.socket.sendMessage).not.toHaveBeenCalled();
    });
  });
});
