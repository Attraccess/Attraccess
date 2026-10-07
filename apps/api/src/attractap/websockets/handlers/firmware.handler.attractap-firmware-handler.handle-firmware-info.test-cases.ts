/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
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
export function registerHandleFirmwareInfoCases(fixture: ReturnType<typeof registerAttractapFirmwareHandlerFixture>) {
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
}
