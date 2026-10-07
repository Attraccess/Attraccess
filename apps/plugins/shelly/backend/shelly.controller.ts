// REST surface for the Shelly device registry, mounted into the host API under
// `/shelly`. Gated behind `resources.update` (device management is an admin-ish capability).
import { Controller, Inject } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { DeviceRegistryService } from './device-registry.service';
import { DiscoveryService } from './discovery.service';
import { ShellyDeviceApiService } from './shelly-device-api.service';
import { ShellyFirmwareService } from './shelly-firmware.service';
import { ShellyProbeService } from './shelly-probe.service';
import { ShellyControllerTryProbeOperation } from './shelly.controller.shelly-controller-try-probe-operation';

@Auth('resources.update')
@Controller('shelly')
export class ShellyController extends ShellyControllerTryProbeOperation {
  constructor(
    @Inject(DeviceRegistryService) registry: DeviceRegistryService,
    @Inject(ShellyProbeService) probe: ShellyProbeService,
    @Inject(DiscoveryService) discovery: DiscoveryService,
    @Inject(ShellyDeviceApiService) deviceApi: ShellyDeviceApiService,
    @Inject(ShellyFirmwareService) firmware: ShellyFirmwareService,
  ) {
    super(registry, probe, discovery, deviceApi, firmware);
  }
}
