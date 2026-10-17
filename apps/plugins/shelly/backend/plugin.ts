import type { PluginBackendAdapters } from '@attraccess/plugins-backend-sdk/adapter';
import { SHELLY_DEVICES } from './devices/registry/persistence/port';
import { TypeormDeviceRegistry } from './devices/registry/persistence/typeorm-adapter';
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk/v2';
import { DynamicModule } from '@nestjs/common';
import { DeviceRegistryService } from './devices/registry/service';
import { DiscoveryService } from './devices/discovery/service';
import { ShellyDevice } from './devices/registry/device.entity';
import { ShellyProbeService } from './devices/discovery/probe.service';
import { ShellyController } from './devices/controller';
import { ShellyDeviceApiService } from './communication/device-api.service';
import { ShellyFirmwareService } from './firmware/service.service';
import { ShellyHttpClient } from './communication/http-client';
import { ShellyLiveUpdatesService } from './firmware/live-updates.service';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry, so this is
// the exact same symbol the host registers.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

class ShellyPluginModule {}

const plugin: PluginBackendModule & PluginBackendAdapters = {
  persistence: { contractVersion: 2, supportedBackends: ['sqlite'] },
  persistenceAdapters: [
    {
      backend: 'sqlite',
      entities: [ShellyDevice],
      operations: [
        {
          token: SHELLY_DEVICES,
          create: ({ manager }) => new TypeormDeviceRegistry(manager.getRepository(ShellyDevice)),
        },
      ],
    },
  ],
  register(context: PluginContext): DynamicModule {
    return {
      module: ShellyPluginModule,
      controllers: [ShellyController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        DeviceRegistryService,
        ShellyProbeService,
        DiscoveryService,
        ShellyHttpClient,
        ShellyDeviceApiService,
        ShellyFirmwareService,
        ShellyLiveUpdatesService,
      ],
    };
  },
};

export default plugin;
