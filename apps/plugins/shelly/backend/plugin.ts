// Shelly management plugin — backend half.
//
// A persisted device registry with a manual add-by-IP flow and a
// generation/model probe (ATT-496), plus mDNS + subnet-scan auto-discovery that
// populates it (ATT-497), device info + admin password management (ATT-498), and
// Zigbee pairing through a zigbee2mqtt gateway (ATT-789).
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
import { DeviceRegistryService } from './device-registry.service';
import { DiscoveryService } from './discovery.service';
import { ShellyDevice } from './shelly-device.entity';
import { ShellyProbeService } from './shelly-probe.service';
import { ShellyController } from './shelly.controller';
import { ShellyDeviceApiService } from './shelly-device-api.service';
import { Z2mGatewayService } from './z2m-gateway.service';
import { ZigbeeGateway } from './zigbee-gateway.entity';
import { ZigbeePairingService } from './zigbee-pairing.service';
import { ZigbeeController } from './zigbee.controller';

// The host hands each plugin its PluginContext under this token. Recreate it
// locally (do not import the value) so the artifact has no runtime dependency on
// the SDK: Symbol.for() resolves against the process-global registry, so this is
// the exact same symbol the host registers.
const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

class ShellyPluginModule {}

const plugin: PluginBackendModule = {
  // Host registers these into the shared DataSource at load time (gated on
  // DATABASE_ACCESS) so the registry service can use a real repository.
  entities: [ShellyDevice, ZigbeeGateway],
  register(context: PluginContext): DynamicModule {
    return {
      module: ShellyPluginModule,
      controllers: [ShellyController, ZigbeeController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        DeviceRegistryService,
        ShellyProbeService,
        DiscoveryService,
        ShellyDeviceApiService,
        Z2mGatewayService,
        ZigbeePairingService,
      ],
    };
  },
};

export default plugin;
