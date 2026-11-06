// Matter plugin — backend half.
//
// ATT-1001: an authenticated, version-checked connection to the Matter sidecar, configured by an administrator
// in the web UI. The sidecar being absent, restarting or incompatible never stops this plugin from loading; it
// shows an explicit degraded state instead. The Matter domain features follow in later tickets.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import type { DynamicModule } from '@nestjs/common';
import { MATTER_AUDIT_DOMAIN } from './connection/audit';
import { MatterConnectionController } from './connection/controller';
import { MatterConnectionService } from './connection/connection.service';
import { MatterConnection } from './connection/entity';
import { MatterSettingsService } from './connection/settings.service';
import { PLUGIN_CONTEXT } from './plugin-context';

class MatterPluginModule {}

const plugin: PluginBackendModule = {
  // Registered into the shared DataSource so `context.getRepository(MatterConnection)` resolves.
  entities: [MatterConnection],
  auditDomains: [MATTER_AUDIT_DOMAIN],
  register(context: PluginContext): DynamicModule {
    return {
      module: MatterPluginModule,
      controllers: [MatterConnectionController],
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, MatterSettingsService, MatterConnectionService],
    };
  },
};

export default plugin;
