import { BadRequestException } from '@nestjs/common';
import { ShellyController } from './shelly.controller';

describe('ShellyController ATT-501 firmware', () => {
  const registry = { list: jest.fn(), findById: jest.fn(), updateProbe: jest.fn() };
  const probe = { probe: jest.fn() };
  const firmware = { getStatus: jest.fn(), startUpdate: jest.fn() };
  let controller: ShellyController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ShellyController(
      registry as never,
      probe as never,
      {} as never,
      {} as never,
      firmware as never
    );
  });

  it('keeps the overview usable when a single device fails its firmware check', async () => {
    registry.list.mockResolvedValue([
      { id: 1, ipAddress: '192.168.1.10', generation: 1 },
      { id: 2, ipAddress: '192.168.1.11', generation: 2 },
      { id: 3, ipAddress: '192.168.1.12', generation: null },
    ]);
    firmware.getStatus
      .mockResolvedValueOnce({ generation: 1, hasUpdate: true })
      .mockRejectedValueOnce(new Error('connect ETIMEDOUT'));

    await expect(controller.firmwareOverview()).resolves.toEqual([
      { deviceId: 1, status: { generation: 1, hasUpdate: true }, error: null },
      { deviceId: 2, status: null, error: 'connect ETIMEDOUT' },
      { deviceId: 3, status: null, error: 'device generation is unknown; probe it first' },
    ]);
  });

  it('starts a stable update by default', async () => {
    registry.findById.mockResolvedValue({ id: 1, ipAddress: '192.168.1.10', generation: 2 });

    await expect(controller.startFirmwareUpdate(1, {})).resolves.toEqual({ started: true, stage: 'stable' });
    expect(firmware.startUpdate).toHaveBeenCalledWith(
      { ipAddress: '192.168.1.10', generation: 2, username: undefined, currentPassword: undefined },
      'stable'
    );
  });

  it('rejects an unknown update stage', async () => {
    registry.findById.mockResolvedValue({ id: 1, ipAddress: '192.168.1.10', generation: 2 });

    await expect(controller.startFirmwareUpdate(1, { stage: 'nightly' as never })).rejects.toBeInstanceOf(BadRequestException);
    expect(firmware.startUpdate).not.toHaveBeenCalled();
  });
});
