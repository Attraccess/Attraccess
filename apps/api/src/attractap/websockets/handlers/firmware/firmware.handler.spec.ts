/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerAttractapFirmwareHandlerFixture } from './handler.test-fixture';
import { openQualifiedOtaSnapshot } from '../../../firmware.service';

jest.mock('../../../firmware.service', () => ({
  ...jest.requireActual('../../../firmware.service'),
  openQualifiedOtaSnapshot: jest.fn(),
}));
import { AttractapEvent, AttractapEventType } from '../../websocket.types';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    statSync: jest.fn(),
    openSync: jest.fn(),
    readSync: jest.fn(),
    fstatSync: jest.fn(),
    closeSync: jest.fn(),
  };
});
describe('AttractapFirmwareHandler', () => {
  const fixture = registerAttractapFirmwareHandlerFixture();
  beforeEach(() => {
    // The shared legacy fixture uses Object.create instead of the constructor.
    // Initialize the handler's per-socket storage explicitly in this suite.
    (fixture.handler as any).contexts = new WeakMap();
    (fixture.handler as any).identities = { isLegacy: jest.fn().mockResolvedValue(true) };
    jest.mocked(openQualifiedOtaSnapshot).mockImplementation(() => ({ fd: 0, size: fixture.mockStatSync('').size }));
    fixture.socket.close = jest.fn();
    fixture.socket.bufferedAmount = 0;
    const filesystem = jest.requireMock('fs');
    filesystem.fstatSync = jest.fn();
    filesystem.closeSync = jest.fn();
  });

  describe('legacy chunk exchange with a socket-owned update', () => {
    const binary = Buffer.alloc(16384, 0xa5);
    beforeEach(async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        name: 'attractap',
        variant: 'touch',
        version: '2.0.0',
        filename: 'fw.bin',
        filenameOTA: 'fw-ota.bin',
      });
      fixture.mockExistsSync.mockReturnValue(true);
      fixture.mockStatSync.mockReturnValue({ size: binary.length } as any);
      fixture.mockOpenSync.mockReturnValue(0 as any);
      fixture.mockReadSync.mockImplementation((_fd, buffer: Buffer, start, length, offset) => {
        binary.copy(buffer, start, offset, offset + length);
        return length;
      });
      await fixture.handler.handleFirmwareInfo(fixture.socket, {
        payload: { name: 'attractap', variant: 'touch', version: '1.0.0' },
      } as AttractapEvent['data']);
    });
    const request = (offset: unknown, length: unknown) =>
      fixture.handler.handleFirmwareChunkRequest(fixture.socket, {
        payload: { offset, length },
      } as AttractapEvent['data']);

    it('denies metadata changes and chunks after secured enrollment', async () => {
      fixture.mockAttractapService.updateReaderFirmware.mockClear();
      (fixture.handler as any).identities.isLegacy.mockResolvedValue(false);
      await fixture.handler.handleFirmwareInfo(fixture.socket, { payload: {} } as AttractapEvent['data']);
      await request(0, 100);
      expect(fixture.mockAttractapService.updateReaderFirmware).not.toHaveBeenCalled();
      expect(fixture.mockOpenSync).not.toHaveBeenCalled();
      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
    });

    it('completes a legacy update in bounded chunks, including descriptor zero', async () => {
      for (let offset = 0; offset < binary.length; offset += 4096) await request(offset, 999999);
      expect(openQualifiedOtaSnapshot).toHaveBeenCalledTimes(1);
      expect(fixture.socket.state.ota.fd).toBe(0);
      const received = Buffer.concat(fixture.socket.sendBinaryData.mock.calls.map(([bytes]) => bytes));
      expect(received).toEqual(binary);
      expect(fixture.socket.sendBinaryData.mock.calls.every(([bytes]) => bytes.length <= 4096)).toBe(true);
    });
    it.each([
      [NaN, 1],
      [Infinity, 1],
      [0.5, 1],
      [0, 0.5],
      [-1, 1],
      [0, 0],
      [16384, 1],
      ['0', 1],
      [0, Infinity],
    ])('rejects invalid offset %s and length %s before opening a file', async (offset, length) => {
      await request(offset, length);
      expect(fixture.mockOpenSync).not.toHaveBeenCalled();
      expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
    });
    it('does not read for an unauthenticated socket or a copied update context', async () => {
      fixture.socket.readerId = null;
      await request(0, 100);
      fixture.socket.readerId = 42;
      const other = { ...fixture.socket, id: 'other', state: { ...fixture.socket.state }, sendBinaryData: jest.fn() };
      await fixture.handler.handleFirmwareChunkRequest(
        other as any,
        { payload: { offset: 0, length: 100 } } as AttractapEvent['data'],
      );
      expect(fixture.mockReadSync).not.toHaveBeenCalled();
      expect(other.sendBinaryData).not.toHaveBeenCalled();
    });
    it('caps the final read at the remaining file length', async () => {
      await request(binary.length - 17, 4096);
      expect(fixture.mockReadSync).toHaveBeenCalledWith(0, expect.any(Buffer), 0, 17, binary.length - 17);
    });
    it('paces sequential fast legacy requests without disconnecting', async () => {
      for (let i = 0; i < 20; i++) await request(0, 100);
      expect(fixture.mockReadSync).toHaveBeenCalledTimes(20);
      expect(fixture.socket.close).not.toHaveBeenCalled();
    });
    it('bounds pending paced responses to one per socket', async () => {
      for (let i = 0; i < 16; i++) await request(0, 100);
      const pending = request(0, 100);
      await new Promise((resolve) => setImmediate(resolve));
      await request(0, 100);
      expect(fixture.socket.close).toHaveBeenCalled();
      await pending;
    });
    it('rejects catalog filenames outside the asset directory', async () => {
      fixture.socket.state.ota = null;
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
        version: '2.0.0',
        filename: '../secret.bin',
      });
      await fixture.handler.handleFirmwareInfo(fixture.socket, {
        payload: { name: 'attractap', variant: 'touch', version: '1.0.0' },
      } as AttractapEvent['data']);
      expect(fixture.socket.state.ota).toBeNull();
    });
  });

  describe('handleFirmwareInfo', () => {
    const payload = { name: 'attractap', variant: 'touch', version: '1.0.0' };
    const data = { payload } as AttractapEvent['data'];

    it('always calls updateReaderFirmware with readerId and payload', async () => {
      fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '1.0.0' });

      await fixture.handler.handleFirmwareInfo(fixture.socket, data);

      expect(fixture.mockAttractapService.updateReaderFirmware).toHaveBeenCalledWith(42, payload, true);
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
