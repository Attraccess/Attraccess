// Shelly management plugin — backend half.
//
// Part 1 of the Shelly management feature (ATT-496): a persisted device registry
// with a manual add-by-IP flow and a generation/model probe. Built as a
// first-class nx app (tag type:plugin); see apps/plugins/scripts for the shared
// esbuild/Vite/zip recipe.
//
// The plugin registers a NestJS module whose controller is mounted into the host
// API and whose services share the host's TypeORM connection via a real
// repository over an owned, namespaced entity (see device-registry.service.ts).
// The `entities` export below tells the host to register that entity's metadata
// into the shared DataSource so getRepository(ShellyDevice) resolves.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { DeviceRegistryService } from './device-registry.service';
import { ShellyDevice } from './shelly-device.entity';
import { ShellyProbeService } from './shelly-probe.service';
import { ShellyController } from './shelly.controller';

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
      ],
    };
  },
};

export default plugin;
