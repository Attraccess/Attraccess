/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent } from '../websocket.types';
import { registerAttractapFirmwareHandlerFixture } from './firmware.handler.attractap-firmware-handler.test-fixture';

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
export function registerHandleFirmwareChunkRequestCases(
  fixture: ReturnType<typeof registerAttractapFirmwareHandlerFixture>,
) {
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
}
