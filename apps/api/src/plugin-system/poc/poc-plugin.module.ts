import { DynamicModule } from '@nestjs/common';
import { PLUGIN_CONTEXT, PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { PocPluginService } from './poc-plugin.service';

/**
 * Throwaway example default export for ATT-454. A real backend plugin ships a
 * module of this exact shape; the host loader calls register(context) to obtain
 * the Nest module definition and re-exposes the context under PLUGIN_CONTEXT.
 */
class PocPluginModule {}

const plugin: PluginBackendModule = {
  register(context: PluginContext): DynamicModule {
    return {
      module: PocPluginModule,
      providers: [{ provide: PLUGIN_CONTEXT, useValue: context }, PocPluginService],
    };
  },
};

export default plugin;
