import { FirmwareOverviewEntry } from './shelly.contracts';
import { Get } from '@nestjs/common';
import { ShellyControllerAddOperation } from './shelly.shelly-controller-add-operation';

export abstract class ShellyControllerFirmwareOverviewOperation extends ShellyControllerAddOperation {
  // Declared before the `devices/:id/...` routes so `firmware` is never parsed
  // as a device id. Best-effort by design: one unreachable or password-protected
  // device must not blank out the whole overview.
  @Get('devices/firmware')
  async firmwareOverview(): Promise<FirmwareOverviewEntry[]> {
    const devices = await this.registry.list();
    return Promise.all(
      devices.map(async (device): Promise<FirmwareOverviewEntry> => {
        if (device.generation === null) {
          return { deviceId: device.id, status: null, error: 'device generation is unknown; probe it first' };
        }
        try {
          const status = await this.firmware.getStatus({
            ipAddress: device.ipAddress,
            generation: device.generation,
          });
          return { deviceId: device.id, status, error: null };
        } catch (err) {
          return { deviceId: device.id, status: null, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }
}
