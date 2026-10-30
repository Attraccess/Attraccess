// Matter plugin — backend half.
//
// ATT-999 ships only the installable foundation: no routes, permissions, migrations, background work or
// connection to the Matter sidecar. The sidecar connection (ATT-1001) and the Matter features follow later.
// The wire contract lives in @attraccess/matter-contract and is not bundled until the connection needs it.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import type { DynamicModule } from '@nestjs/common';

class MatterPluginModule {}

const plugin: PluginBackendModule = {
  register(_context: PluginContext): DynamicModule {
    return { module: MatterPluginModule };
  },
};

export default plugin;
