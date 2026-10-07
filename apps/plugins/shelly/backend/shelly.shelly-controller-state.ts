import { Inject } from '@nestjs/common';
import { DeviceRegistryService } from './device-registry.service';
import { DiscoveryService } from './discovery.service';
import { ShellyDeviceApiService } from './shelly-device-api.service';
import { ShellyFirmwareService } from './shelly-firmware.service';
import { ShellyProbeService } from './shelly-probe.service';
import { ShellyControllerDiscoverContract } from './shelly.shelly-controller-discover-contract';

export abstract class ShellyControllerState extends ShellyControllerDiscoverContract {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(
    @Inject(DeviceRegistryService) protected readonly registry: DeviceRegistryService,
    @Inject(ShellyProbeService) protected readonly probe: ShellyProbeService,
    @Inject(DiscoveryService) protected readonly discovery: DiscoveryService,
    @Inject(ShellyDeviceApiService) protected readonly deviceApi: ShellyDeviceApiService,
    @Inject(ShellyFirmwareService) protected readonly firmware: ShellyFirmwareService,
  ) {
    super();
  }
}
