// Shelly management plugin — backend half.
//
// A persisted device registry with a manual add-by-IP flow and a
// generation/model probe (ATT-496), plus mDNS + subnet-scan auto-discovery that
// populates it (ATT-497), and device info + admin password management (ATT-498).
// Built as a first-class nx app (tag type:plugin); see
// apps/plugins/scripts for the shared esbuild/Vite/zip recipe.
//
// The plugin registers a NestJS module whose controller is mounted into the host
// API and whose services share the host's TypeORM connection via a real
// repository over an owned, namespaced entity (see device-registry.service.ts).
// The `entities` export below tells the host to register that entity's metadata
// into the shared DataSource so getRepository(ShellyDevice) resolves.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
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

const plugin: PluginBackendModule = {
  // Host registers these into the shared DataSource at load time (gated on
  // DATABASE_ACCESS) so the registry service can use a real repository.
  entities: [ShellyDevice],
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
