import { ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { DeviceRegistryService } from './device-registry.service';
import { ShellyFirmwareService } from './shelly-firmware.service';
import { defer } from 'rxjs';

@Injectable()
export class ShellyLiveUpdatesService implements OnModuleInit {
  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) private readonly context: PluginContext,
    @Inject(DeviceRegistryService) private readonly registry: DeviceRegistryService,
    @Inject(ShellyFirmwareService) private readonly firmware: ShellyFirmwareService,
  ) {}

  onModuleInit(): void {
    if (!this.context.liveUpdates)
      throw new Error('Shelly live updates require a host with plugin live-update support');
    this.context.liveUpdates.register({
      topic: 'firmware',
      identifier: 'required',
      authorize: async ({ identifier }, user) => {
        if (!user.effectivePermissions?.has('resources.update')) throw new ForbiddenException();
        if (!/^[1-9]\d*$/.test(identifier ?? '') || !Number.isSafeInteger(Number(identifier)))
          throw new NotFoundException();
        if (!(await this.registry.findById(Number(identifier)))) throw new NotFoundException();
      },
      source: ({ identifier }) =>
        defer(() =>
          this.firmware.observe(Number(identifier), async () => {
            const device = await this.registry.findById(Number(identifier));
            if (!device?.generation) throw new NotFoundException();
            return { ipAddress: device.ipAddress, generation: device.generation };
          }),
        ),
    });
  }
}
