/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerAttractapFirmwareHandlerFixture } from './handler.test-fixture';
import { AttractapEvent, AttractapEventType } from '../../websocket.types';

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

    it('ignores a repeated request for bytes already sent on this connection', async () => {
      fixture.socket.state.ota = { path: '/tmp/fw.bin', size: 100000, fd: 9 };
      fixture.mockReadSync.mockReturnValue(4096 as any);
      const request = (offset: number) =>
        fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
          payload: { offset, length: 4096 },
        } as AttractapEvent['data']);

      await request(8192);
      // The reader asked twice for one chunk (a retry and a resume after its reconnect).
      await request(8192);
      await request(12288);

      const offsets = fixture.mockReadSync.mock.calls.map((call) => call[4]);
      expect(offsets).toEqual([8192, 12288]);
      expect(fixture.socket.sendBinaryData).toHaveBeenCalledTimes(2);
      expect((fixture.handler as any).logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring repeated chunk request'),
      );
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
      fixture.mockReadSync.mockReturnValue(50 as any);
      await fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
        payload: { offset: 150, length: 50 },
      } as AttractapEvent['data']);

      // (150+50)/1000 = 20% -> bucket 20 > 10
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

    it.each([
      ['2.0.0 with the cardRelay capability', { version: '2.0.0', capabilities: { cardRelay: true } }, true],
      ['an older firmware without capabilities', { version: '1.9.3' }, false],
      ['2.0.0 without the capability', { version: '2.0.0', capabilities: {} }, false],
      ['a non-boolean capability', { version: '2.0.0', capabilities: { cardRelay: 'true' } }, false],
    ])('sets cardRelay from FIRMWARE_INFO: %s', async (_name, info, expected) => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue(null);
      // A reconnecting reader that downgraded must not keep a previous connection's capability.
      fixture.socket.state.cardRelay = !expected;

      await fixture.handler.handleFirmwareInfo(fixture.socket, {
        payload: { name: 'attractap', variant: 'touch', ...info },
      } as AttractapEvent['data']);

      expect(fixture.socket.state.cardRelay).toBe(expected);
    });

    it.each([
      [
        'a touch reader with the sessionDuration capability',
        { version: '3.0.0', capabilities: { sessionDuration: true } },
        true,
      ],
      ['an older firmware without capabilities', { version: '2.9.0' }, false],
      ['firmware that does not report sessionDuration', { version: '3.0.0', capabilities: { cardRelay: true } }, false],
      ['a non-boolean capability', { version: '3.0.0', capabilities: { sessionDuration: 'true' } }, false],
    ])('sets sessionDuration from FIRMWARE_INFO: %s', async (_name, info, expected) => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue(null);
      // A reconnecting reader that downgraded must not keep a previous connection's capability.
      fixture.socket.state.sessionDuration = !expected;

      await fixture.handler.handleFirmwareInfo(fixture.socket, {
        payload: { name: 'attractap', variant: 'touch', ...info },
      } as AttractapEvent['data']);

      expect(fixture.socket.state.sessionDuration).toBe(expected);
    });

    it.each([
      ['the BLE Bridge', { capabilities: { nfc: false } }, false],
      ['2.10.0 with NFC', { capabilities: { nfc: true } }, true],
      ['firmware that does not report nfc', { capabilities: {} }, true],
    ])('stores the nfc capability from FIRMWARE_INFO: %s', async (_name, info, expected) => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue(null);
      fixture.socket.state.nfc = !expected;

      await fixture.handler.handleFirmwareInfo(fixture.socket, {
        payload: { name: 'attractap', variant: 'touch', version: '2.10.0', ...info },
      } as AttractapEvent['data']);

      expect(fixture.socket.state.nfc).toBe(expected);
      expect(fixture.mockAttractapService.updateReaderFirmware).toHaveBeenCalledWith(
        fixture.socket.readerId,
        expect.objectContaining({ capabilities: expect.objectContaining({ nfc: expected }) }),
      );
    });

    it.each([
      [
        'a v1 BLE capability',
        {
          version: 1,
          operations: [
            'scan',
            'connect',
            'read',
            'write',
            'writeWithoutResponse',
            'subscribe',
            'unsubscribe',
            'cancel',
          ],
          maxMtu: 517,
          maxPendingRequests: 16,
        },
        { supported: true, capability: { version: 1, maxMtu: 517, maxPendingRequests: 16 } },
      ],
      ['no BLE capability', undefined, { supported: false, detail: 'no-ble-capability' }],
      ['another protocol version', { version: 2, operations: [] }, { supported: false, detail: 'protocol-version:2' }],
    ])('stores capabilities.ble from FIRMWARE_INFO on the socket: %s', async (_name, ble, expected) => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue(null);
      // A reconnecting reader that downgraded must not keep a previous connection's capability.
      fixture.socket.state.ble = { supported: false, detail: 'stale' };

      await fixture.handler.handleFirmwareInfo(fixture.socket, {
        payload: { name: 'attractap', variant: 'touch', version: '2.5.0', capabilities: { cardRelay: true, ble } },
      } as AttractapEvent['data']);

      expect(fixture.socket.state.ble).toMatchObject(expected);
    });

    describe('the reported build', () => {
      it('hands the build to the session before the database writes, and records it', async () => {
        fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '2.6.0' });
        const setBuild = jest.fn();
        (fixture.socket as any).sessionSecurity = { setBuild };
        const order: string[] = [];
        setBuild.mockImplementation(() => order.push('session'));
        fixture.mockAttractapService.recordReaderBuild.mockImplementation(async () => order.push('record'));

        await fixture.handler.handleFirmwareInfo(fixture.socket, {
          payload: { name: 'attractap', variant: 'touch', version: '2.6.0', profile: 'secure', release: true },
        } as AttractapEvent['data']);

        const build = expect.objectContaining({ profile: 'secure', release: true, variant: 'touch' });
        expect(setBuild).toHaveBeenCalledWith(build);
        expect(fixture.mockAttractapService.recordReaderBuild).toHaveBeenCalledWith(42, build);
        expect(order).toEqual(['session', 'record']);
      });

      it('records the build of a reader whose session has no security state', async () => {
        fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '2.6.0' });

        await fixture.handler.handleFirmwareInfo(fixture.socket, { payload } as AttractapEvent['data']);

        expect(fixture.mockAttractapService.recordReaderBuild).toHaveBeenCalledWith(
          42,
          expect.objectContaining({ profile: null, release: false }),
        );
      });
    });

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
